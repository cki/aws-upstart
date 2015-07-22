var aws = require('aws-sdk');
var events = require('events');
var util = require('util');

// Use Frankfurt as our region
aws.config.region = 'eu-central-1';
var ec = new aws.EC2();


function Upstart(desiredRunning) {
	events.EventEmitter.call(this);
	this.main();
	this.desiredRunning = desiredRunning;

	setInterval(this.main.bind(this),30000);
}
util.inherits(Upstart, events.EventEmitter);

Upstart.prototype.main = function() {
	console.log('===========STATUS UPDATE: ');
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
		if(runningInstances.length == this.desiredRunning) {
			// TODO: Write logging?
			console.log('STATUS: All Good');
		}

		// to little instances
		else if(runningInstances.length < this.desiredRunning) {
			if((pendingInstances.length+runningInstances.length) < this.desiredRunning) {
				var tooLittle = this.desiredRunning-runningInstances.length;
				for(var i = 0; i<tooLittle; i++) startInstance();
				console.log('STATUS: Too little instances, started '+tooLittle+' instances');
			}
			else console.log('STATUS: Should be good next cycle');
		}

		// to many instances
		else {
			var tooMany = (runningInstances.length+pendingInstances.length) - this.desiredRunning;

			for(;tooMany>0;tooMany--) {
				// start killing the pending machines, start with last sorted
				if(pendingInstances.length>0) {
					pendingInstances = pendingInstances.sort(function(a,b) {
						return a.launchTime>b.launchTime;
					});
					killInstance(pendingInstances.pop());
				}
				// start killing running instances, start with longest running
				else {
					runningInstances = runningInstances.sort(function(a,b) {
						return a.launchTime<b.launchTime;
					});
					killInstance(runningInstances.pop());
				}
			}
		}

		// output running instanceIds to log
		console.log('RUNNING INSTANCES: ');
		runningInstances.forEach(function(instance) {
			console.log(instance.instanceId);
		});
		console.log('-------------------');

		this.emit('update', runningInstances);
	}.bind(this));
};


/*
 Should be used by some polling function.
 Checks the status of all instances and 
 callsback with status info
*/
Upstart.prototype.checkStatus = function(cb) {
	// params empty in order to get status of all instances
	var params = { /* InstanceIds: [instanceIds] */ };

	ec.describeInstances(params, function(err, data) {
		if(err) {
			console.error('could not get instance infos', err);
			if(cb) cb(false);
			return;
		}

		var temp = data.Reservations.map(function(reservation) {
			return reservation.Instances.map(function(instance) {
				return {
					instanceId: instance.InstanceId,
					status: instance.State.Name,
					ip: instance.PublicIpAddress,
					publicDNS: instance.PublicDnsName,
					launchTime: instance.LaunchTime
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
function startInstance(cb) {
	// create 1 t1.micro instance with our image
	// TODO: exchange with correct image
	var params = {
		DryRun: false,
		ImageId: 'ami-a8221fb5', 
		InstanceType: 't2.micro',
		MinCount: 1, MaxCount: 1
	};

	ec.runInstances(params, function(err, data) {
		if(err) {
			console.error('could not create instance', err);
			if(cb) cb(false);
			return;
		}

		if(cb) cb(true);
	});
};

/*
 Kills given Instance
*/
function killInstance(instance, cb) {
	var params = { InstanceIds: [instance.instanceId]	};

	ec.terminateInstances(params, function(err, data) {
		if(err) {
			console.error('could not kill instance: '+instance.instanceId, err);
			if(cb) cb(false);
			return;
		}
		console.log('killed instance: '+instance.instanceId);
		if(cb) cb(true);
	});
};

module.exports = Upstart;
