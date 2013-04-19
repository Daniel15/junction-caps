var junction = require('junction'),
	Message = junction.elements.Message,
	capabilities = require('junction-caps').capabilities,
	capabilitiesParser = require('junction-caps').capabilitiesParser;

var options = {
	type: 'client',
	jid: 'example@jabber.org',
	password: 'example'
};

var app = junction.create();

app.use(junction.dump({ prefix: 'RECV: ' }));
app.filter(junction.filters.dump( { prefix: 'XMIT: ' }));

app.use(capabilitiesParser());
app.use(capabilities(function(handler) {
	handler.on('capabilities', function(jid, caps) {
		console.log(jid + ' supports Multi-User chat? ' + caps.features.muc + ', XHTML? ' + caps.features.xhtml + ', Google video? ' + caps.features.googleVideo);
		console.log(caps);
	})
}));

app.use(junction.serviceUnavailable());
app.use(junction.errorHandler({ dumpExceptions: true }));

app.connect(options).on('online', function() {
	console.log('Connected as: ' + this.jid);
	this.send(new junction.elements.Presence());
});