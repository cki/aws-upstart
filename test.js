var Upstart = require('./upstart.js');

var upstart = new Upstart();

upstart.on('update', function(data) {
    console.log('CALLER: ',data);
});
