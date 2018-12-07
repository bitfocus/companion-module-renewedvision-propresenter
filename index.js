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


/**
 * The current state of ProPresentation.
 * Initially populated by emptyCurrentState().
 */
instance.prototype.currentState = { };


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

	self.makeConnection();
	self.initVariables();
};


/**
 * When the module gets deleted.
 */
instance.prototype.destroy = function() {
	var self = this;

	if (self.socket !== undefined) {
		if (self.socket.readyState !== 3) {
			self.socket.terminate();
		}

		self.socket.close();
		delete self.socket;
	}

	if (self.reconTimer !== undefined) {
		clearInterval(self.reconTimer);
		delete self.reconTimer;
	}

	debug("destroy", self.id);
};


/**
 * Initialize an empty current state.
 */
instance.prototype.emptyCurrentState = function() {
	var self = this;

	self.currentState = {
		currentSlide : 'N/A',
		presentationPath : '-',
		presentationName : 'N/A',
		totalSlides : 'N/A',
		connectionStatus : 'Not connected'
	};

};


/**
 * Initialze the available variables.
 */
instance.prototype.initVariables = function() {
	var self = this;

	var variables = [
		{
			label: 'Current slide number',
			name:  'currentSlide'
		},
		{
			label: 'Total slides in presentation',
			name:  'totalSlides'
		},
		{
			label: 'Presentation name',
			name:  'presentationName'
		},
		{
			label: 'Connection status',
			name:  'connectionStatus'
		}
	];

	self.setVariableDefinitions(variables);

	// Initialize the current state and update Companion with the variables.
	self.emptyCurrentState();
	self.updateVariables();

};


/**
 * Update Companion with the current state.
 */
instance.prototype.updateVariables = function() {
	var self = this;
	self.setVariable('currentSlide', self.currentState.currentSlide);
	self.setVariable('presentationName', self.currentState.presentationName);
	self.setVariable('totalSlides', self.currentState.totalSlides);
	self.setVariable('connectionStatus', self.currentState.connectionStatus);
};


/**
 * Create a timer to connect to ProPresenter,
 */
instance.prototype.makeConnection = function() {
	var self = this;

	// Create a reconnect timer to watch the socket. If disconnected try to connect.
	self.reconTimer = setInterval(function() {

		if(self.config.host === '' || self.config.port === '') {
			// Not configured properly.
			return;
		}

		if (self.socket === undefined || self.currentStatus == self.STATE_ERROR || self.socket.readyState === 3 /*CLOSED*/) {
			// Not connected. Try to connect again.
			self.connectToProPresenter()
		}

	}, 5000);

};


/**
 * Updates the cinnection status variable.
 */
instance.prototype.setConnectionStatus = function(status) {
	var self = this;
	self.currentState.connectionStatus = status;
	self.updateVariables();
};


/**
 * Makes the connection to ProPresenter.
 */
instance.prototype.connectToProPresenter = function() {
	var self = this;

	if (self.socket !== undefined) {
		if (self.socket.readyState !== 3 /*CLOSED*/) {
			self.socket.terminate();
		}
		delete self.socket;
	}

	self.socket = new WebSocket('ws://'+self.config.host+':'+self.config.port+'/remote');

	self.setConnectionStatus('Connecting');

	self.socket.on('open', function open() {
		self.socket.send(JSON.stringify({
			password: self.config.pass,
			protocol: "610",
			action: "authenticate"
		}));
		self.status(self.STATE_OK);

		debug(" WS STATE: " +self.socket.readyState)
	});

	self.socket.on('error', function (err) {
		debug("Network error", err);
		self.status(self.STATE_ERROR, err.message);
		self.log('error',"Network error: " + err.message);
	});

	self.socket.on('connect', function () {
		self.status(self.STATE_OK);
		debug("Connected");
	});

	self.socket.on('close', function(code, reason) {
		self.status(self.STATE_ERROR, 'Not connected to ProPresenter');
		// Reset the variables to reflect we lost connection.
		self.emptyCurrentState();
		self.updateVariables();
	});

	self.socket.on('message', function(message) {
		// Handle the message received from ProPresenter
		self.onWebSocketMessage(message);
	});

};


/**
 * Register the available actions with Companion.
 */
instance.prototype.actions = function(system) {
	var self = this;

	self.system.emit('instance_actions', self.id, {
		'next': { label: 'Next Slide' },
		'last': { label: 'Previous Slide' },
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


/**
 * Action triggered by Companion.
 */
instance.prototype.action = function(action) {
	var self = this;
	var opt = action.options

	switch (action.action) {

		case 'next':
			cmd = '{"action":"presentationTriggerNext"}';
			break;

		case 'last':
			cmd = '{"action":"presentationTriggerPrevious"}';
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
		} else {
			debug('Socket not connected :(');
			self.status(self.STATE_ERROR);
		}
	}

};


/**
 * Received a message from ProPresenter
 */
instance.prototype.onWebSocketMessage = function(message) {
	var self = this;

	var objData = JSON.parse(message);

	switch(objData.action) {
		case 'authenticate':
			if(objData.error === '') {
				// Successfully authentation. Request current state.
				self.setConnectionStatus('Connected');
				self.getProPresenterState();
			}
			break;


		case 'presentationTriggerIndex':
		case 'presentationSlideIndex':
			// Update the current slide index
			self.currentState.currentSlide = parseInt(objData.slideIndex, 10) + 1;
			break;


		case 'presentationCurrent':
			var objPresentation = objData.presentation;
			self.currentState.presentationName = objPresentation.presentationName;
			self.currentState.presentationPath = objPresentation.presentationCurrentLocation;

			// Get the total number of slides in this presentation
			var totalSlides = 0;
			for(var i=0; i<objPresentation.presentationSlideGroups.length; i++) {
				totalSlides += objPresentation.presentationSlideGroups[i].groupSlides.length;
			}

			self.currentState.totalSlides = totalSlides;
			break;

	}

	if(objData.presentationPath !== undefined && objData.presentationPath !== self.currentState.presentationPath) {
		// The presenationPath has changed. Update the path and request the information.
		self.currentState.presentationPath = objData.presentationPath;
		self.getProPresenterState();
	}

	self.updateVariables();

};


/**
 * Requests the current state from ProPresenter.
 */
instance.prototype.getProPresenterState = function() {
	var self = this;

	self.socket.send(JSON.stringify({
		action: 'presentationCurrent'
	}));

	if(self.currentState.currentSlide === '') {
		// The currentSlide will be empty when the module first loads. Request it.
		self.socket.send(JSON.stringify({
			action: 'presentationSlideIndex'
		}));
	}

};

instance_skel.extendedBy(instance);
exports = module.exports = instance;
