var aws = require('aws-sdk');
var events = require('events');
var util = require('util');

/* config data */
// Use Frankfurt as our region
aws.config.region = 'eu-central-1';
// instances we want to be running state
const desiredRunning = 2;

var ec = new aws.EC2();

function Upstart() {
	events.EventEmitter.call(this);
	setInterval(this.update.bind(this),30000);
}


Upstart.prototype.update = function() {
	this.checkStatus(function(instances) {
		if(!instances) {
			console.error('can not check status of instances!');
			return;
		}

		var runningInstances = instances.filter(function(instance) {
			return instance.status == 'running';
		});

		var pendingInstances = instances.filter(function(instance) {
			return instance.status == 'pending';
		});

		//SWITCH: No switch because I hate switch
		// correct amount of running instances
		if(runningInstances.length == desiredRunning) {
			// TODO: Write logging?
				console.log('STATUS: All Good');
		}

		// to little instances
		else if(runningInstances.length < desiredRunning) {
			if((pendingInstances.length+runningInstances.length) < desiredRunning) {
				var tooLittle = desiredRunning-runningInstances.length;
				console.log('STATUS: Too little instances, starting '+tooLittle+' instances');
				for(var i = 0; i<tooLittle; i++) this.startInstance();
			}
			else console.log('STATUS: Should be good next cycle');
		}

		// to many instances
		else {
			var tooMany = (runningInstances.length+pendingInstances.length) - desiredRunning;

			for(;tooMany>0;tooMany--) {
				// start killing the pending machines, start with last sorted
				if(pendingInstances.length>0) {
					pendingInstances = pendingInstances.sort(function(a,b) {return a>b;});
					this.killInstance(pendingInstances.pop());
				}
				// start killing running instances, start with longest running
				else {
					runningInstances = runningInstances.sort(function(a,b) {return a<b;});
					this.killInstance(runningInstances.pop());
				}
			}
		}

		this.emit('update', runningInstances);

		// output running instanceIds to log
		console.log('RUNNING INSTANCES: ');
		runningInstances.forEach(function(instance) {
			console.log(instance.instanceId);
		});
		console.log('-------------------');
	});
};

/*
 Should be used by some polling function.
 Checks the status of all instances and 
 callsback with status info
*/
Upstart.Prototype.checkStatus = function(cb) {
	// params empty in order to get status of all instances
	var params = { /* InstanceIds: [instanceIds] */ };

	ec.describeInstances(params, function(err, data) {
		if(err) {
			console.error('could not get instance infos', err);
			if(cb) cb(false);
			return;
		}

		var temp = data.reservations.map(function(reservation) {
			reservation.instances.map(function(instance) {
				return {
					instanceId: instance.instanceId,
					status: instance.state.name,
					ip: instance.PublicIpAddress
				};
			});
		});

		// TODO: Smoothen out unpacking of nested array ..
		if(cb) cb( [].concat.apply([], temp) );
	});
};

/*
 Starts an Amazon Instance, 
 and callsback with ip, instanceid and status
*/
Upstart.Prototype.startInstance = function(cb) {
	// create 1 t1.micro instance with our image
	// TODO: exchange with correct image
	var params = {
		DryRun: true,
		ImageId: 'ami-a8221fb5', 
		InstanceType: 't2.micro',
		MinCount: 1, MaxCount: 1
	};

	ec.runInstance(params, function(err, data) {
		if(err) {
			console.error('could not create instance', err);
			if(cb) cb(false);
			return;
		}
		
		// Should always be correct since we never start 2 instances?
		var instance = data.Instances[0];
		var instanceId = instance.InstanceId;
		var status = instance.state.name;
		var ip = instance.PublicIpAddress;
		
		if(cb) cb({
			instanceId: instanceId,
			status: status,
			ip: ip
		});
	});
};

/*
 Kills given Instance
*/
Upstart.prototype.killInstance = function(instance, cb) {
	var params = { InstanceIds: [instance.InstanceId]	};

	ec.terminateInstances(params, function(err, data) {
		if(err) {
			console.error('could not kill instance: '+instance.instanceId, err);
			if(cb) cb(false);
			return;
		}
		console.log('killed instance: '+instance.InstanceId);
		if(cb) cb(true);
	});
};

Upstart.prototype.getActiveInstances = function(cb) {
	this.checkStatus(function(instances) {
		if(!instances) {
			console.error('can not check status of instances!');
			return;
		}

		var runningInstances = instances.filter(function(instance) {
			return instance.status == 'running';
		});
		cb(runningInstances);
	});
};

module.exports.Upstart = Upstart;
