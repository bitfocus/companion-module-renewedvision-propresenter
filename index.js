var instance_skel  = require('../../instance_skel');
const WebSocket    = require('ws');
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
	self.init_ws()

};

// When module gets deleted
instance.prototype.destroy = function() {
	var self = this;

	if (self.socket !== undefined) {
		self.socket.close();
	}

	if (self.timer !== undefined) {
		clearInterval(self.timer);
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
		self.socket.on('open', function open() {
			self.socket.send('{"pwd":'+self.config.pass+',"ptl":610,"acn":"ath"}')
			self.status(self.STATE_OK);
			debug(" WS STATE: " +self.socket.readyState)
			self.timer = setInterval(self.index.bind(self), 500)
			self.timer = setInterval(self.recon.bind(self), 5000)
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
		'clearaudio': { label: 'Clear Audio' }
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
				self.init_ws()
		}

}

// debug('action():', action);

};


instance.module_info = {
	label: 'ProPresenter 6',
	id: 'propresenter6',
	version: '2.1.0'
};

instance_skel.extendedBy(instance);
exports = module.exports = instance;
