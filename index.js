var instance_skel = require('../../instance_skel');
const WebSocket = require('ws');
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

instance.prototype.init = function() {
	var self = this;
	debug = self.debug;
	log = self.log;
	self.status(self.STATE_UNKNOWN);
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
			default: '53118'
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
	var ws = new WebSocket('ws://'+self.config.host+':'+self.config.port+'/remote');
};

// When module gets deleted
instance.prototype.destroy = function() {
	var self = this;

	if (self.socket !== undefined) {
		self.socket.destroy();
	}

	debug("destroy", self.id);
};


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
	});
};

instance.prototype.action = function(action, config, ws) {
	var self = this;
	var cmd;
	var ws = ws
	var opt = action.options;
	var ws = new WebSocket('ws://'+self.config.host+':'+self.config.port+'/remote');
	ws.on('open', function open() {
		ws.send('{"pwd":'+self.config.pass+',"ptl":610,"acn":"ath"}')
		ws.send('{"action":"presentationSlideIndex"}')
	});

	if (action.action == 'next') {
		ws.on('open', function open() {
			ws.send('{"action":"presentationSlideIndex"}')
		});

		ws.on('message', function incoming(data) {
			var slideData = JSON.parse(data)
			var nextSlide = parseInt(slideData.slideIndex) + 1
			ws.send('{"action":"presentationTriggerIndex","slideIndex":'+nextSlide+',"presentationPath":" "}')
		});
	}

	else if (action.action == 'last') {
		ws.on('open', function open() {
			ws.send('{"action":"presentationSlideIndex"}')
		});

		ws.on('message', function incoming(data) {
			var slideData = JSON.parse(data)
      var nextIndex = parseInt(slideData.slideIndex)-1
			ws.send('{"action":"presentationTriggerIndex","slideIndex":'+nextIndex+',"presentationPath":" "}');
		});
	}

  else if (action.action == 'clearall') {
    ws.on('open', function open() {
      ws.send('{"action":"clearAll"}')
    });
  }

  else if (action.action == 'clearslide') {
    ws.on('open', function open() {
      ws.send('{"action":"clearText"}')
    });
  }

  else if (action.action == 'slideNumber') {
    ws.on('open', function open() {
      var nextIndex = parseInt(action.options.slide)-1
			ws.send('{"action":"presentationTriggerIndex","slideIndex":'+nextIndex+',"presentationPath":" "}');
		});
  }

	debug('action():', action.action);
};

instance.module_info = {
	label: 'ProPresenter 6',
	id: 'propresenter6',
	version: '1.0.0'
};

instance_skel.extendedBy(instance);
exports = module.exports = instance;
