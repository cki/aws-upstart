var aws = require('aws-sdk');


/* config data */
// Use Frankfurt as our region
aws.config.region = 'eu-central-1';

// instances we want to be running state
const desiredRunning = 2;

var ec = new aws.EC2();

setInterval(function() {
	checkStatus(function(instances) {
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
				for(var i = 0; i<tooLittle; i++) startInstance();
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
					killInstance(pendingInstances.pop());
				}
				// start killing running instances, start with longest running
				else {
					runningInstances = runningInstances.sort(function(a,b) {return a<b;});
					killInstance(runningInstances.pop());
				}
			}
		}

	});
}, 30000);

/*
 Should be used by some polling function.
 Checks the status of all instances and 
 callsback with status info
*/
function checkStatus(cb) {
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
}

/*
 Starts an Amazon Instance, 
 and callsback with ip, instanceid and status
*/
function startInstance(cb) {
	// create 1 t1.micro instance with our image
	// TODO: exchange with correct image
	var params = {
		ImageId: 'ami-1624987f',
		InstanceType: 't1.micro',
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
}

/*
 Kills given Instance
*/
function killInstance(instance, cb) {
	var params = { InstanceIds: [instance.InstanceId]	};

	ec.stopInstances(params, function(err, data) {
		if(err) {
			console.error('could not kill instance: '+instance.instanceId, err);
			if(cb) cb(false);
			return;
		}
		console.log('killed instance');
		if(cb) cb(true);
	});
}

function getActiveInstances(cb) {
	checkStatus(function(instances) {
		if(!instances) {
			console.error('can not check status of instances!');
			return;
		}

		var runningInstances = instances.filter(function(instance) {
			return instance.status == 'running';
		});
		cb(runningInstances);
	});
}

module.exports.getActiveInstances = getActiveInstances;
