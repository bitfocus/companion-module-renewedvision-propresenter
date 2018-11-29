var instance_skel  = require('../../instance_skel');
var WebSocket      = require('ws');
var debug;
var log;

function instance(system, id, config) {
	var self = this;
	self.awaiting_reply = false;
	self.command_queue = [];

	// super-constructor
	instance_skel.apply(this, arguments);
	self.actions(); // export actions
	return self;
}

// Return config fields for web config
instance.prototype.config_fields = function () {
	var self = this;
	return [
		{
			type: 'text',
			id: 'info',
			width: 12,
			label: 'Information',
			value: "This module communicates with Renewed Vision's ProPresenter 6"
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'ProPresenter IP',
			width: 6,
			regex: self.REGEX_IP
		},
		{
			type: 'textinput',
			id: 'port',
			label: 'ProPresenter Port',
			width: 6,
			default: ''
		},
		{
			type: 'textinput',
			id: 'pass',
			label: 'ProPresenter Password',
			width: 8,
		}
	]
};

instance.prototype.updateConfig = function(config) {
	var self = this;
	self.config = config;
};

instance.prototype.init = function() {
	var self = this;
	debug = self.debug;
	log = self.log;

	self.init_ws();
};

// When module gets deleted
instance.prototype.destroy = function() {
	var self = this;

	if (self.socket !== undefined) {
		if (self.socket.readyState !== 3) {
			self.socket.terminate();
		}

		self.socket.close();
		delete self.socket;
	}

	if (self.indexTimer !== undefined) {
		clearInterval(self.indexTimer);
		delete self.indexTimer;
	}

	if (self.reconTimer !== undefined) {
		clearInterval(self.reconTimer);
		delete self.reconTimer;
	}

	debug("destroy", self.id);
};

instance.prototype.init_ws = function() {
	var self = this;

	if (self.socket !== undefined) {
		if (self.socket.readyState !== 3) {
			self.socket.terminate();
			delete self.socket;
		}
	}

	if (self.config.host) {
		self.socket = new WebSocket('ws://'+self.config.host+':'+self.config.port+'/remote');

		if (self.reconTimer !== undefined) {
			clearInterval(self.reconTimer);
			delete self.reconTimer;
		}
		self.reconTimer = setInterval(self.recon.bind(self), 5000)

		self.socket.on('open', function open() {
			self.socket.send('{"pwd":'+self.config.pass+',"ptl":610,"acn":"ath"}')
			self.status(self.STATE_OK);

			debug(" WS STATE: " +self.socket.readyState)

			if (self.indexTimer !== undefined) {
				clearInterval(self.indexTimer);
				delete self.indexTimer;
			}

			self.indexTimer = setInterval(self.index.bind(self), 250)
		});

		self.socket.on('error', function (err) {
			debug("Network error", err);
			self.status(self.STATE_ERROR, err.message);
			self.log('error',"Network error: " + err.message);
		});

		self.socket.on('connect', function () {
			self.status(self.STATE_OK);
			debug("Connected");
		})

		self.socket.on('message', function incoming(data) {
			var slideData = JSON.parse(data)
			self.slideIndex = slideData.slideIndex
		})

	}
};

instance.prototype.index = function(){
	var self = this;
	if (self.currentStatus !== self.STATE_ERROR) {
		try {
			self.socket.send('{"action":"presentationSlideIndex"}');
		}
		catch (e) {
			debug("NETWORK " + e)
			self.status(self.STATE_ERROR, e);
		}
	}
}

instance.prototype.recon = function(){
	var self = this;

	if (self.currentStatus == self.STATE_ERROR) {
		self.init_ws()
	}
}

instance.prototype.actions = function(system) {
	var self = this;

	self.system.emit('instance_actions', self.id, {
		'next': { label: 'Next Slide' },
		'last': { label: 'Last Slide' },
		'slideNumber': {
			label: 'Specific Slide',
			options: [
				{
					 type: 'textinput',
					 label: 'Slide Number',
					 id: 'slide',
					 default: 1,
					 regex: self.REGEX_SIGNED_NUMBER
				}
			]
		},
		'clearall': { label: 'Clear All' },
		'clearslide': { label: 'Clear Slide' },
		'clearprops': { label: 'Clear Props' },
		'clearaudio': { label: 'Clear Audio' },
		'clearbackground': { label: 'Clear Background' },
		'cleartelestrator': { label: 'Clear Telestrator' },
		'cleartologo': { label: 'Clear to Logo' },
   		'stageDisplayLayout': {
			label: 'Stage Display Layout',
			options: [
				{
					type: 'textinput',
					label: 'Stage Display Index',
					id: 'index',
					default: 0,
					regex: self.REGEX_SIGNED_NUMBER
				}
			]
		},
		'stageDisplayMessage': {
			label: 'Stage Display Message',
			options: [
				{
					type: 'textinput',
					label: 'Message',
					id: 'message',
					default: ''
				}
			]
		},
		'stageDisplayHideMessage': { label: 'Stage Display Hide Message' }

	});
};

instance.prototype.action = function(action) {
	var self = this;
	var opt = action.options

	switch (action.action) {

		case 'next':
			var nextSlide = parseInt(self.slideIndex) + 1
			cmd = '{"action":"presentationTriggerIndex","slideIndex":'+nextSlide+',"presentationPath":" "}'
			break;

		case 'last':
			var nextSlide = parseInt(self.slideIndex) + -1
			cmd = '{"action":"presentationTriggerIndex","slideIndex":'+nextSlide+',"presentationPath":" "}'
			break;

		case 'slideNumber':
			var nextIndex = parseInt(opt.slide)-1
			cmd = '{"action":"presentationTriggerIndex","slideIndex":'+nextIndex+',"presentationPath":" "}';
			break;

		case 'clearall':
			cmd = '{"action":"clearAll"}';
			break;

		case 'clearslide':
			cmd = '{"action":"clearText"}';
			break;

		case 'clearprops':
			cmd = '{"action":"clearProps"}';
			break;

		case 'clearaudio':
			cmd = '{"action":"clearAudio"}';
			break;

		case 'clearbackground':
			cmd = '{"action":"clearVideo"}';
			break;

		case 'cleartelestrator':
			cmd = '{"action":"clearTelestrator"}';
			break;

		case 'cleartologo':
			cmd = '{"action":"clearToLogo"}';
			break;

		case 'stageDisplayLayout':
			cmd = '{"action":"stageDisplaySetIndex","stageDisplayIndex":'+opt.index+'}';
			break;

		case 'stageDisplayMessage':
			var message = JSON.stringify(opt.message);
			cmd = '{"action":"stageDisplaySendMessage","stageDisplayMessage":'+message+'}';
			break;

		case 'stageDisplayHideMessage':
			cmd = '{"action":"stageDisplayHideMessage"}';
			break;
		};

		if (cmd !== undefined) {

			if (self.currentStatus !== self.STATE_ERROR) {
					try {
						self.socket.send(cmd);
					}
					catch (e) {
						debug("NETWORK " + e)
						self.status(self.STATE_ERROR, e);
					}
				}

			else {
				debug('Socket not connected :(');
				self.status(self.STATE_ERROR);
//				self.init_ws(); should not be needed
		}

	}

};

instance_skel.extendedBy(instance);
exports = module.exports = instance;
