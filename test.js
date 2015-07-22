var Upstart = require('./upstart.js');

var upstart = new Upstart(2);

upstart.on('update', function(data) {
    console.log('CALLER: ',data);
});
