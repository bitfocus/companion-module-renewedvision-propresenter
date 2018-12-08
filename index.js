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


/**
 * Return config fields for web config
 */
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


/**
 * The user changed the config options for this modules.
 */
instance.prototype.updateConfig = function(config) {
	var self = this;
	self.config = config;
	self.disconnectFromProPresenter();
	self.connectToProPresenter();
	self.startConnectionTimer();
};


/**
 * Module is starting up.
 */
instance.prototype.init = function() {
	var self = this;
	debug = self.debug;
	log = self.log;

	if(self.config.host !== '' && self.config.port !== '') {
		self.connectToProPresenter();
		self.startConnectionTimer();
	}
	
	self.initVariables();
};


/**
 * When the module gets deleted.
 */
instance.prototype.destroy = function() {
	var self = this;

	self.disconnectFromProPresenter();
	self.stopConnectionTimer();

	debug("destroy", self.id);
};


/**
 * Initialize an empty current state.
 */
instance.prototype.emptyCurrentState = function() {
	var self = this;

	self.currentState = {
		_wsConnected : false,
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
			name:  'current_slide'
		},
		{
			label: 'Total slides in presentation',
			name:  'total_slides'
		},
		{
			label: 'Presentation name',
			name:  'presentation_name'
		},
		{
			label: 'Connection status',
			name:  'connection_status'
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
	self.setVariable('current_slide', self.currentState.currentSlide);
	self.setVariable('presentation_name', self.currentState.presentationName);
	self.setVariable('total_slides', self.currentState.totalSlides);
	self.setVariable('connection_status', self.currentState.connectionStatus);
};


/**
 * Create a timer to connect to ProPresenter,
 */
instance.prototype.startConnectionTimer = function() {
	var self = this;

	// Stop the timer if it was already running
	self.stopConnectionTimer();

	// Create a reconnect timer to watch the socket. If disconnected try to connect.
	self.reconTimer = setInterval(function() {

		if (self.socket === undefined || self.socket.readyState === 3 /*CLOSED*/) {
			// Not connected. Try to connect again.
			self.connectToProPresenter();
		}

	}, 5000);

};


/**
 * Stops the reconnection timer.
 */
instance.prototype.stopConnectionTimer = function() {
	var self = this;

	if (self.reconTimer !== undefined) {
		clearInterval(self.reconTimer);
		delete self.reconTimer;
	}

};


/**
 * Updates the connection status variable.
 */
instance.prototype.setConnectionVariable = function(status, updateLog) {
	var self = this;
	self.currentState.connectionStatus = status;

	if(updateLog) {
		self.log('info', "ProPresenter " + status);
	}
	self.updateVariables();
};


/**
 * Disconnect the websocket from ProPresenter, if connected.
 */
instance.prototype.disconnectFromProPresenter = function() {
	var self = this;

	if (self.socket !== undefined) {
		// Disconnect if already connected
		if (self.socket.readyState !== 3 /*CLOSED*/) {
			self.socket.terminate();
		}
		delete self.socket;
	}

};


/**
 * Attempts to open a websocket connection with ProPresenter.
 */
instance.prototype.connectToProPresenter = function() {
	var self = this;

	// Disconnect if already connected
	self.disconnectFromProPresenter();

	if(self.config.host === '' || self.config.port === '') {
		return;
	}

	self.socket = new WebSocket('ws://'+self.config.host+':'+self.config.port+'/remote');

	self.setConnectionVariable('Trying to connect', false);

	self.socket.on('open', function open() {
		self.socket.send(JSON.stringify({
			password: self.config.pass,
			protocol: "610",
			action: "authenticate"
		}));

	});

	self.socket.on('error', function (err) {
		self.status(self.STATE_ERROR, err.message);
	});

	self.socket.on('connect', function () {
		debug("Connected");
		self.log('info', "Connected to " + self.config.host +":"+ self.config.port);
	});

	self.socket.on('close', function(code, reason) {
		// Event is also triggered when a reconnect attempt fails.
		// Reset the current state then abort; don't flood logs with disconnected notices.

		var wasConnected = self.currentState._wsConnected;
		self.emptyCurrentState();
	
		if(wasConnected === false) {
			return;
		}

		self.status(self.STATE_ERROR, 'Not connected to ProPresenter');
		self.setConnectionVariable('Disconnected', true);

		// Reset the variables to reflect we lost connection.
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
 * Received a message from ProPresenter.
 */
instance.prototype.onWebSocketMessage = function(message) {
	var self = this;
	var objData = JSON.parse(message);

	switch(objData.action) {
		case 'authenticate':
			if(objData.authenticated === 1) {
				self.status(self.STATE_OK);
				self.currentState._wsConnected = true;
				// Successfully authenticated. Request current state.
				self.setConnectionVariable('Connected', true);
				self.getProPresenterState();
			} else {
				self.status(self.STATE_ERROR);
				// Bad password
				self.log('warn', objData.error);
				self.disconnectFromProPresenter();

				// No point in trying to connect again. The user must either re-enable this
				//	module or re-save the config changes to make another attempt.
				self.stopConnectionTimer();
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
		// The presentationPath has changed. Update the path and request the information.
		self.getProPresenterState();
	}

	self.updateVariables();

};


/**
 * Requests the current state from ProPresenter.
 */
instance.prototype.getProPresenterState = function() {
	var self = this;

	if(self.currentState._wsConnected === false) {
		return;
	}

	self.socket.send(JSON.stringify({
		action: 'presentationCurrent'
	}));

	if(self.currentState.currentSlide === 'N/A') {
		// The currentSlide will be empty when the module first loads. Request it.
		self.socket.send(JSON.stringify({
			action: 'presentationSlideIndex'
		}));
	}

};

instance_skel.extendedBy(instance);
exports = module.exports = instance;
