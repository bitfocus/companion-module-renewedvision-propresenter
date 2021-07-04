var instance_skel = require('../../instance_skel')
var WebSocket = require('ws')
var debug
var log

function instance(system, id, config) {
	var self = this
	self.awaiting_reply = false
	self.command_queue = []

	// super-constructor
	instance_skel.apply(this, arguments)
	self.actions() // export actions
	return self
}

/**
 * The current state of ProPresenter.
 * Initially populated by emptyCurrentState().
 *
 * .internal contains the internal state of the module
 * .dynamicVariable contains the values of the dynamic variables
 */
instance.prototype.currentState = {
	internal: {},
	dynamicVariables: {},
}

/**
 * Return config fields for web config
 */
instance.prototype.config_fields = function () {
	var self = this
	return [
		{
			type: 'text',
			id: 'info',
			width: 12,
			label: 'Information',
			value: "This module communicates with Renewed Vision's ProPresenter 6 or 7",
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'ProPresenter IP',
			width: 6,
			default: '',
			regex: self.REGEX_IP,
		},
		{
			type: 'textinput',
			id: 'port',
			label: 'ProPresenter Port',
			width: 6,
			default: '20652',
			regex: self.REGEX_PORT,
		},
		{
			type: 'textinput',
			id: 'pass',
			label: 'ProPresenter Remote Password',
			width: 6,
		},
		{
			type: 'textinput',
			id: 'indexOfClockToWatch',
			label: 'Index of Clock to Watch',
			tooltip:
				'Index of clock to watch.  Dynamic variable "watched_clock_current_time" will be updated with current value once every second.',
			default: '0',
			width: 4,
			regex: self.REGEX_NUMBER,
		},
		{
			type: 'dropdown',
			id: 'GUIDOfStageDisplayScreenToWatch',
			label: 'Pro7 Stage Display Screen To Monitor Layout',
			tooltip:
				'Pro7 Stage Display Screen To Monitor Layout - (This list is refreshed the next time you EDIT config, after a succesful connection)',
			default: '',
			width: 6,
			choices: self.currentState.internal.pro7StageScreens,
		},
		{
			type: 'dropdown',
			id: 'sendPresentationCurrentMsgs',
			label: 'Send Presentation Info Requests To ProPresenter',
			tooltip:
				'You may want to turn this off for Pro7 as it can cause performance issues - Turning it off will mean the module does not update the dynamic variables: remaining_slides, total_slides or presentation_name',
			default: 'yes',
			width: 6,
			choices: [
				{ id: 'no', label: 'No' },
				{ id: 'yes', label: 'Yes' },
			],
		},
		{
			type: 'textinput',
			id: 'clientVersion',
			label: 'ProRemote Client Version',
			tooltip:
				'No need to update this - unless trying to work around an issue with connectivity for future Pro7 releases.',
			width: 6,
			default: '701',
		},
		{
			type: 'text',
			id: 'info',
			width: 12,
			label: 'Stage Display Settings (Optional)',
			value: 'The following fields are only needed if you want the video countdown timer in a dynamic variable.',
		},
		{
			type: 'dropdown',
			label: 'Connect to Stage Display?',
			id: 'use_sd',
			default: 'no',
			width: 6,
			choices: [
				{ id: 'no', label: 'No' },
				{ id: 'yes', label: 'Yes' },
			],
		},
		{
			type: 'textinput',
			id: 'sdport',
			label: 'Stage Display App Port',
			tooltip: 'Optionally set in ProPresenter Preferences. ProPresenter Port (above) will be used if left blank.',
			width: 6,
			default: '',
			// regex from instance_skel.js, but modified to make the port optional
			regex:
				'/^([1-9]|[1-8][0-9]|9[0-9]|[1-8][0-9]{2}|9[0-8][0-9]|99[0-9]|[1-8][0-9]{3}|9[0-8][0-9]{2}|99[0-8][0-9]|999[0-9]|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-4])$|^$/',
		},
		{
			type: 'textinput',
			id: 'sdpass',
			label: 'Stage Display App Password',
			width: 6,
		},
		{
			type: 'text',
			id: 'info2',
			width: 12,
			label: 'Pro7 Follower Settings (Optional)',
			value: 'Optional *Beta* feature to mimic Pro6 Master-Control module',
		},
		{
			type: 'dropdown',
			label: 'Auto-Control Follower ProPresenter?',
			id: 'control_follower',
			default: 'no',
			width: 6,
			choices: [
				{ id: 'no', label: 'No' },
				{ id: 'yes', label: 'Yes' },
			],
		},
		{
			type: 'textinput',
			id: 'followerhost',
			label: 'Follower-ProPresenter IP',
			width: 6,
			default: '',
			regex: self.REGEX_IP,
		},
		{
			type: 'textinput',
			id: 'followerport',
			label: 'Follower-ProPresenter Port',
			width: 6,
			default: '20652',
			regex: self.REGEX_PORT,
		},
		{
			type: 'textinput',
			id: 'followerpass',
			label: 'Follower-ProPresenter Remote Password',
			width: 6,
		},
	]
}

/**
 * The user changed the config options for this modules.
 */
instance.prototype.updateConfig = function (config) {
	var self = this
	self.config = config
	self.init_presets()
	self.disconnectFromProPresenter()
	self.disconnectFromProPresenterSD()
	self.connectToProPresenter()
	self.startConnectionTimer()
	if (self.config.use_sd === 'yes') {
		self.connectToProPresenterSD()
		self.startSDConnectionTimer()
	} else {
		self.stopSDConnectionTimer()
	}
	if (self.config.control_follower === 'yes') {
		self.connectToFollowerProPresenter()
		self.startFollowerConnectionTimer()
	} else {
		self.stopFollowerConnectionTimer()
	}
}

/**
 * Module is starting up.
 */
instance.prototype.init = function () {
	var self = this
	debug = self.debug
	log = self.log
	self.init_presets()

	self.initVariables()

	if (self.config.host !== '' && self.config.port !== '') {
		self.connectToProPresenter()
		self.startConnectionTimer()
		if (self.config.use_sd === 'yes') {
			self.startSDConnectionTimer()
			self.connectToProPresenterSD()
		}
		if (self.config.control_follower === 'yes') {
			self.startFollowerConnectionTimer()
			self.connectToFollowerProPresenter()
		}
	}
}

/**
 * When the module gets deleted.
 */
instance.prototype.destroy = function () {
	var self = this

	self.disconnectFromProPresenter()
	self.disconnectFromProPresenterSD()
	self.stopConnectionTimer()
	self.stopSDConnectionTimer()

	debug('destroy', self.id)
}

/**
 * Define button presets
 */
instance.prototype.init_presets = function () {
	var self = this

	var presets = [
		{
			category: 'Stage Display',
			label:
				'This button displays the name of current stage display layout. Pressing it will toggle back and forth between the two selected stage display layouts in the down and up actions.',
			bank: {
				style: 'text',
				text: '$(propresenter:current_stage_display_name)',
				size: '18',
				color: self.rgb(255, 255, 255),
				bgcolor: self.rgb(153, 0, 255),
				latch: true,
			},
			actions: [
				{
					action: 'stageDisplayLayout',
					options: {
						index: 0,
					},
				},
			],
			release_actions: [
				{
					action: 'stageDisplayLayout',
					options: {
						index: 1,
					},
				},
			],
		},
		{
			category: 'Stage Display',
			label: 'This button will activate the selected (by index) stage display layout.',
			bank: {
				style: 'text',
				text: 'Select Layout',
				size: '18',
				color: self.rgb(255, 255, 255),
				bgcolor: self.rgb(153, 0, 255),
			},
			actions: [
				{
					action: 'stageDisplayLayout',
					options: {
						index: 0,
					},
				},
			],
		},
		{
			category: 'Countdown Clocks',
			label:
				'This button will reset a selected (by index) clock to a 5 min countdown clock and automatically start it.',
			bank: {
				style: 'text',
				text: 'Clock ' + self.config.indexOfClockToWatch + '\\n5 mins',
				size: '18',
				color: self.rgb(255, 255, 255),
				bgcolor: self.rgb(0, 153, 51),
			},
			actions: [
				{
					action: 'clockUpdate',
					options: {
						clockIndex: self.config.indexOfClockToWatch, // N.B. If user updates indexOfClockToWatch, this preset default will not be updated until module is reloaded.
						clockTime: '00:05:00',
						clockOverRun: 'false',
						clockType: 0,
					},
				},
				{
					action: 'clockReset',
					delay: 100,
					options: {
						clockIndex: self.config.indexOfClockToWatch, // N.B. If user updates indexOfClockToWatch, this preset default will not be updated until module is reloaded.
					},
				},
				{
					action: 'clockStart',
					delay: 200,
					options: {
						clockIndex: self.config.indexOfClockToWatch, // N.B. If user updates indexOfClockToWatch, this preset default will not be updated until module is reloaded.
					},
				},
			],
		},
		{
			category: 'Countdown Clocks',
			label:
				'This button will START a clock selected by index (0-based). If you change the index, and still want to display the current time on the button, make sure to also update the index of the clock to watch in this modules config to match.',
			bank: {
				style: 'text',
				text: 'Start\\nClock ' + self.config.indexOfClockToWatch + '\\n$(propresenter:watched_clock_current_time)',
				size: '14',
				color: self.rgb(255, 255, 255),
				bgcolor: self.rgb(0, 153, 51),
			},
			actions: [
				{
					action: 'clockStart',
					options: {
						clockIndex: self.config.indexOfClockToWatch, // N.B. If user updates indexOfClockToWatch, this preset default will not be updated until module is reloaded.
					},
				},
			],
		},
		{
			category: 'Countdown Clocks',
			label:
				'This button will STOP a clock selected by index (0-based). If you change the index, and still want to display the current time on the button, make sure to also update the index of the clock to watch in this modules config to match.',
			bank: {
				style: 'text',
				text: 'Stop\\nClock ' + self.config.indexOfClockToWatch + '\\n$(propresenter:watched_clock_current_time)',
				size: '14',
				color: self.rgb(255, 255, 255),
				bgcolor: self.rgb(204, 0, 0),
			},
			actions: [
				{
					action: 'clockStop',
					options: {
						clockIndex: self.config.indexOfClockToWatch, // N.B. If user updates indexOfClockToWatch, this preset default will not be updated until module is reloaded.
					},
				},
			],
		},
		{
			category: 'Countdown Clocks',
			label:
				'This button will RESET a clock selected by index (0-based). If you change the index, and still want to display the current time on the button, make sure to also update the index of the clock to watch in this modules config to match.',
			bank: {
				style: 'text',
				text: 'Reset\\nClock ' + self.config.indexOfClockToWatch + '\\n$(propresenter:watched_clock_current_time)',
				size: '14',
				color: self.rgb(255, 255, 255),
				bgcolor: self.rgb(255, 102, 0),
			},
			actions: [
				{
					action: 'clockReset',
					options: {
						clockIndex: self.config.indexOfClockToWatch, // N.B. If user updates indexOfClockToWatch, this preset default will not be updated until module is reloaded.
					},
				},
			],
		},
	]
	self.setPresetDefinitions(presets)
}

/**
 * Initialize an empty current state.
 */
instance.prototype.emptyCurrentState = function () {
	var self = this

	self.log('debug', 'emptyCurrentState')

	// Reinitialize the currentState variable, otherwise this variable (and the module's
	//	state) will be shared between multiple instances of this module.
	self.currentState = {}

	// The internal state of the connection to ProPresenter
	self.currentState.internal = {
		wsConnected: false,
		wsSDConnected: false,
		wsFollowerConnected: false,
		presentationPath: '-',
		slideIndex: 0,
		proMajorVersion: 6, // Behaviour is slightly different between the two major versions of ProPresenter (6 & 7). Use this flag to run version-specific code where required. Default to 6 -  Pro7 can be detected once authenticated.
		pro7StageLayouts: [{ id: '0', label: 'Connect to Pro7 to Update' }],
		pro7StageScreens: [{ id: '0', label: 'Connect to Pro7 to Update' }],
		previousTimeOfLeaderClearMessage: null,
		pro7Looks: [{ id: '0', label: 'Connect to Pro7 to Update' }],
		pro7Macros: [{ id: '0', label: 'Connect to Pro7 to Update' }],
	}

	// The dynamic variable exposed to Companion
	self.currentState.dynamicVariables = {
		current_slide: 'N/A',
		remaining_slides: 'N/A',
		total_slides: 'N/A',
		presentation_name: 'N/A',
		connection_status: 'Disconnected',
		sd_connection_status: 'Disconnected',
		follower_connection_status: 'Disconnected',
		video_countdown_timer: 'N/A',
		watched_clock_current_time: 'N/A',
		current_stage_display_name: 'N/A',
		current_stage_display_index: 'N/A',
		current_pro7_stage_layout_name: 'N/A',
		current_pro7_look_name: 'N/A',
	}

	// Update Companion with the default state if each dynamic variable.
	Object.keys(self.currentState.dynamicVariables).forEach(function (key) {
		self.updateVariable(key, self.currentState.dynamicVariables[key])
	})
}

/**
 * Initialize the available variables. (These are listed in the module config UI)
 */
instance.prototype.initVariables = function () {
	var self = this

	var variables = [
		{
			label: 'Current slide number',
			name: 'current_slide',
		},
		{
			label: 'Remaining Slides',
			name: 'remaining_slides',
		},
		{
			label: 'Total slides in presentation',
			name: 'total_slides',
		},
		{
			label: 'Presentation name',
			name: 'presentation_name',
		},
		{
			label: 'Connection status',
			name: 'connection_status',
		},
		{
			label: 'Watched Clock, Current Time',
			name: 'watched_clock_current_time',
		},
		{
			label: 'Current Stage Display Index',
			name: 'current_stage_display_index',
		},
		{
			label: 'Current Pro7 Stage Layout Name',
			name: 'current_pro7_stage_layout_name',
		},
		{
			label: 'Current Pro7 Look Name',
			name: 'current_pro7_look_name',
		},
		{
			label: 'Current Stage Display Name',
			name: 'current_stage_display_name',
		},
		{
			label: 'Video Countdown Timer',
			name: 'video_countdown_timer',
		},
		{
			label: 'Follower Connection Status',
			name: 'follower_connection_status',
		},
	]

	self.setVariableDefinitions(variables)

	// Initialize the current state and update Companion with the variables.
	self.emptyCurrentState()
}

/**
 * Updates the dynamic variable and records the internal state of that variable.
 *
 * Will log a warning if the variable doesn't exist.
 */
instance.prototype.updateVariable = function (name, value) {
	var self = this

	if (name !== 'watched_clock_current_time') {
		// Avoid flooding log with timer updates... (may have to manually revert to debug future timer message issues)
		self.log('debug', 'updateVariable: ' + name + ' to ' + value)
	}

	if (self.currentState.dynamicVariables[name] === undefined) {
		self.log('warn', 'Variable ' + name + ' does not exist')
		return
	}

	self.currentState.dynamicVariables[name] = value
	self.setVariable(name, value)

	if (name === 'connection_status') {
		self.checkFeedbacks('propresenter_module_connected')
	}
}

/**
 * Create a timer to connect to ProPresenter.
 */
instance.prototype.startConnectionTimer = function () {
	var self = this

	// Stop the timer if it was already running
	self.stopConnectionTimer()

	self.log('debug', 'Starting ConnectionTimer')
	// Create a reconnect timer to watch the socket. If disconnected try to connect.
	self.reconTimer = setInterval(function () {
		if (self.socket === undefined || self.socket.readyState === 3 /*CLOSED*/) {
			// Not connected. Try to connect again.
			self.connectToProPresenter()
		} else {
			self.currentState.internal.wsConnected = true
		}
	}, 3000)
}

/**
 * Stops the reconnection timer.
 */
instance.prototype.stopConnectionTimer = function () {
	var self = this

	self.log('debug', 'Stopping ConnectionTimer')
	if (self.reconTimer !== undefined) {
		clearInterval(self.reconTimer)
		delete self.reconTimer
	}
}

/**
 * Create a timer to connect to ProPresenter stage display.
 */
instance.prototype.startSDConnectionTimer = function () {
	var self = this

	// Stop the timer if it was already running
	self.stopSDConnectionTimer()

	// Create a reconnect timer to watch the socket. If disconnected try to connect
	self.log('debug', 'Starting SDConnectionTimer')
	self.reconSDTimer = setInterval(function () {
		if (self.sdsocket === undefined || self.sdsocket.readyState === 3 /*CLOSED*/) {
			// Not connected. Try to connect again.
			self.connectToProPresenterSD()
		} else {
			self.currentState.internal.wsSDConnected = true
		}
	}, 5000)
}

/**
 * Stops the stage display reconnection timer.
 */
instance.prototype.stopSDConnectionTimer = function () {
	var self = this

	self.log('debug', 'Stopping SDConnectionTimer')
	if (self.reconSDTimer !== undefined) {
		clearInterval(self.reconSDTimer)
		delete self.reconSDTimer
	}
}

/**
 * Create a timer to connect to Follower ProPresenter.
 */
instance.prototype.startFollowerConnectionTimer = function () {
	var self = this

	// Stop the timer if it was already running
	self.stopFollowerConnectionTimer()

	self.log('debug', 'Starting Follower ConnectionTimer')
	// Create a reconnect timer to watch the socket. If disconnected try to connect.
	self.reconFollowerTimer = setInterval(function () {
		if (self.followersocket === undefined || self.followersocket.readyState === 3 /*CLOSED*/) {
			// Not connected. Try to connect again.
			self.connectToFollowerProPresenter()
		} else {
			self.currentState.internal.wsFollowerConnected = true
		}
	}, 3000)
}

/**
 * Stops the follower reconnection timer.
 */
instance.prototype.stopFollowerConnectionTimer = function () {
	var self = this

	self.log('debug', 'Stopping Follower ConnectionTimer')
	if (self.reconFollowerTimer !== undefined) {
		clearInterval(self.reconFollowerTimer)
		delete self.reconFollowerTimer
	}
}

/**
 * Updates the connection status variable.
 */
instance.prototype.setConnectionVariable = function (status, updateLog) {
	var self = this

	self.updateVariable('connection_status', status)

	if (updateLog) {
		self.log('info', 'ProPresenter ' + status)
	}
}

/**
 * Updates the stage display connection status variable.
 */
instance.prototype.setSDConnectionVariable = function (status, updateLog) {
	var self = this

	self.updateVariable('sd_connection_status', status)

	if (updateLog) {
		self.log('info', 'ProPresenter Stage Display ' + status)
	}
}

/**
 * Disconnect the websocket from ProPresenter, if connected.
 */
instance.prototype.disconnectFromProPresenter = function () {
	var self = this

	if (self.socket !== undefined) {
		// Disconnect if already connected
		if (self.socket.readyState !== 3 /*CLOSED*/) {
			self.socket.terminate()
		}
		delete self.socket
	}
	self.currentState.internal.wsConnected = false
	self.setConnectionVariable('Disconnected', true)
}

/**
 * Disconnect the websocket from ProPresenter stage display, if connected.
 */
instance.prototype.disconnectFromProPresenterSD = function () {
	var self = this

	if (self.sdsocket !== undefined) {
		// Disconnect if already connected
		if (self.sdsocket.readyState !== 3 /*CLOSED*/) {
			self.sdsocket.terminate()
		}
		delete self.sdsocket
	}
}

/**
 * Disconnect the websocket from Follower ProPresenter, if connected.
 */
instance.prototype.disconnectFromFollowerProPresenter = function () {
	var self = this

	if (self.followersocket !== undefined) {
		// Disconnect if already connected
		if (self.followersocket.readyState !== 3 /*CLOSED*/) {
			self.followersocket.terminate()
		}
		delete self.followersocket
	}

	self.checkFeedbacks('propresenter_follower_connected')
}

/**
 * Attempts to open a websocket connection with ProPresenter.
 */
instance.prototype.connectToProPresenter = function () {
	var self = this

	// Check for undefined host or port. Also make sure port is [1-65535] and host is least 1 char long.
	if (
		!self.config.host ||
		self.config.host.length < 1 ||
		!self.config.port ||
		self.config.port < 1 ||
		self.config.port > 65535
	) {
		// Do not try to connect with invalid host or port
		return
	}

	// Disconnect if already connected
	self.disconnectFromProPresenter()

	// Connect to remote control websocket of ProPresenter
	self.socket = new WebSocket('ws://' + self.config.host + ':' + self.config.port + '/remote')

	self.socket.on('open', function open() {
		self.log('info', 'Opened websocket to ProPresenter remote control: ' + self.config.host + ':' + self.config.port)
		self.socket.send(
			JSON.stringify({
				password: self.config.pass,
				protocol: self.config.clientVersion ? self.config.clientVersion : '701', // This will connect to Pro6 and Pro7 (the version check is happy with higher versions - but versions too low will be refused)
				action: 'authenticate',
			})
		)
	})

	self.socket.on('error', function (err) {
		self.status(self.STATUS_ERROR, err.message)
	})

	//self.socket.on('connect', function () {
	//	debug("Connected to ProPresenter remote control");
	//});

	self.socket.on('close', function (code, reason) {
		// Event is also triggered when a reconnect attempt fails.
		// Reset the current state then abort; don't flood logs with disconnected notices.
		var wasConnected = self.currentState.internal.wsConnected

		self.log('info', 'socket closed')

		if (wasConnected === false) {
			return
		}

		self.emptyCurrentState() // This is also sets self.currentState.internal.wsConnected to false

		self.status(self.STATUS_ERROR, 'Not connected to ProPresenter')
		self.setConnectionVariable('Disconnected', true)
	})

	self.socket.on('message', function (message) {
		// Handle the message received from ProPresenter
		self.onWebSocketMessage(message)
	})
}

/**
 * Attempts to open a websocket connection with ProPresenter stage display.
 */
instance.prototype.connectToProPresenterSD = function () {
	var self = this

	// Check for undefined host or port. Also make sure port is [1-65535] and host is least 1 char long.
	if (
		!self.config.host ||
		self.config.host.length < 1 ||
		!self.config.port ||
		self.config.port < 1 ||
		self.config.port > 65535
	) {
		// Do not try to connect with invalid host or port
		return
	}

	// Disconnect if already connected
	self.disconnectFromProPresenterSD()

	if (self.config.host === undefined) {
		return
	}

	// Check for undefined sdport. Also make sure sdport is [1-65535]. (Otherwise, use ProPresenter remote port)
	if (!self.config.sdport || self.config.sdport < 1 || self.config.sdport > 65535) {
		self.config.sdport = self.config.port
	}

	// Connect to Stage Display websocket of ProPresenter
	self.sdsocket = new WebSocket('ws://' + self.config.host + ':' + self.config.sdport + '/stagedisplay')

	self.sdsocket.on('open', function open() {
		self.log('info', 'Opened websocket to ProPresenter stage display: ' + self.config.host + ':' + self.config.sdport)
		self.sdsocket.send(
			JSON.stringify({
				pwd: self.config.sdpass,
				ptl: 610, //Pro7 still wants 610 ! (so this works for both Pro6 and Pro7)
				acn: 'ath',
			})
		)
	})

	// Since Stage Display connection is not required to function - we will only send a warning if it fails
	self.sdsocket.on('error', function (err) {
		// If stage display can't connect - it's not really a "code red" error - since *most* of the core functionally does not require it.
		// Therefore, a failure to connect stage display is more of a warning state.
		// However, if the module is already in error, then we should not lower that to warning!
		if (self.currentStatus !== self.STATUS_ERROR && self.config.use_sd === 'yes') {
			self.status(self.STATUS_WARNING, 'OK - Stage Display not connected')
		}
	})

	//self.sdsocket.on('connect', function () {
	//	debug("Connected to ProPresenter stage display");
	//	self.log('info', "Connected to ProPresenter stage display" + self.config.host +":"+ self.config.sdport);
	//});

	self.sdsocket.on('close', function (code, reason) {
		// Event is also triggered when a reconnect attempt fails.
		// Reset the current state then abort; don't flood logs with disconnected notices.

		var wasSDConnected = self.currentState.internal.wsSDConnected

		if (wasSDConnected === false) {
			return
		}

		self.emptyCurrentState()

		if (self.config.use_sd === 'yes') {
			self.status(self.STATUS_WARNING, 'OK, But Stage Display closed')
		}
		self.setSDConnectionVariable('Disconnected', true)
	})

	self.sdsocket.on('message', function (message) {
		// Handle the stage display message received from ProPresenter
		self.onSDWebSocketMessage(message)
	})
}

/**
 * Attempts to open a websocket connection with Follower ProPresenter.
 */
instance.prototype.connectToFollowerProPresenter = function () {
	var self = this

	// Check for undefined host or port. Also make sure port is [1-65535] and host is least 1 char long.
	if (
		!self.config.followerhost ||
		self.config.followerhost.length < 1 ||
		!self.config.followerport ||
		self.config.followerport < 1 ||
		self.config.followerport > 65535
	) {
		// Do not try to connect with invalid host or port
		return
	}

	// Disconnect if already connected
	self.disconnectFromFollowerProPresenter()

	// Connect to remote control websocket of ProPresenter
	self.followersocket = new WebSocket('ws://' + self.config.followerhost + ':' + self.config.followerport + '/remote')

	self.followersocket.on('open', function open() {
		self.log(
			'info',
			'Opened websocket to Follower ProPresenter remote control: ' +
				self.config.followerhost +
				':' +
				self.config.followerport
		)
		self.followersocket.send(
			JSON.stringify({
				password: self.config.followerpass,
				protocol: self.config.clientVersion ? self.config.clientVersion : '701', // This will connect to Pro6 and Pro7 (the version check is happy with higher versions)
				action: 'authenticate',
			})
		)
	})

	self.followersocket.on('error', function (err) {
		if (self.config.control_follower === 'yes') {
			self.log('warn', 'Follower Socket error: ' + err.message)
		}
	})

	self.followersocket.on('close', function (code, reason) {
		// Event is also triggered when a reconnect attempt fails.
		// Reset the current state then abort; don't flood logs with disconnected notices.
		var wasFollowerConnected = self.currentState.internal.wsFollowerConnected
		self.currentState.internal.wsFollowerConnected = false

		if (wasFollowerConnected === false) {
			return
		}
		self.log('info', 'Follower ProPresenter socket connection closed')
	})

	self.followersocket.on('message', function (message) {
		// Handle the message received from ProPresenter
		self.onFollowerWebSocketMessage(message)
	})
}

/**
 * Register the available actions with Companion.
 */
instance.prototype.actions = function (system) {
	var self = this

	self.system.emit('instance_actions', self.id, {
		next: { label: 'Next Slide' },
		last: { label: 'Previous Slide' },
		slideNumber: {
			label: 'Specific Slide',
			options: [
				{
					type: 'textinput',
					label: 'Slide Number',
					id: 'slide',
					default: 1,
					regex: self.REGEX_SIGNED_NUMBER,
				},
				{
					type: 'textinput',
					label: 'Presentation Path',
					id: 'path',
					default: '',
					tooltip: 'See the README for more information',
					regex: '/^$|^\\d+$|^\\d+(\\.\\d+)*:\\d+$/',
				},
			],
		},
		clearall: { label: 'Clear All' },
		clearslide: { label: 'Clear Slide' },
		clearprops: { label: 'Clear Props' },
		clearaudio: { label: 'Clear Audio' },
		clearbackground: { label: 'Clear Background' },
		cleartelestrator: { label: 'Clear Telestrator' },
		cleartologo: { label: 'Clear to Logo' },
		clearAnnouncements: { label: 'Clear Announcements' },
		clearMessages: { label: 'Clear Messages' },
		stageDisplayLayout: {
			label: 'Pro6 Stage Display Layout',
			options: [
				{
					type: 'textinput',
					label: 'Pro6 Stage Display Index',
					id: 'index',
					default: 0,
					regex: self.REGEX_NUMBER,
				},
			],
		},
		pro7StageDisplayLayout: {
			label: 'Pro7 Stage Display Layout',
			options: [
				{
					type: 'dropdown',
					label: 'Pro7 Stage Display Screen',
					id: 'pro7StageScreenUUID',
					tooltip: 'Choose which stage display screen you want to update layout',
					default: '',
					choices: self.currentState.internal.pro7StageScreens,
				},
				{
					type: 'dropdown',
					label: 'Pro7 Stage Display Layout',
					id: 'pro7StageLayoutUUID',
					tooltip: 'Choose the new stage display layout to apply',
					default: '',
					choices: self.currentState.internal.pro7StageLayouts,
				},
			],
		},
		pro7SetLook: {
			label: 'Pro7 Set Look',
			options: [
				{
					type: 'dropdown',
					label: 'Look',
					id: 'pro7LookUUID',
					tooltip: 'Choose which Look to make live',
					default: '',
					choices: self.currentState.internal.pro7Looks,
				},
			],
		},
		pro7TriggerMacro: {
			label: 'Pro7 Trigger Macro',
			options: [
				{
					type: 'dropdown',
					label: 'Macro',
					id: 'pro7MacroUUID',
					tooltip: 'Choose which Macro to trigger',
					default: '',
					choices: self.currentState.internal.pro7Macros,
				},
			],
		},
		stageDisplayMessage: {
			label: 'Stage Display Message',
			options: [
				{
					type: 'textinput',
					label: 'Message',
					id: 'message',
					default: '',
				},
			],
		},
		stageDisplayHideMessage: { label: 'Stage Display Hide Message' },
		clockStart: {
			label: 'Start Clock',
			options: [
				{
					type: 'textinput',
					label: 'Clock Number',
					id: 'clockIndex',
					default: 0,
					tooltip: 'Zero based index of countdown clock - first one is 0, second one is 1 and so on...',
					regex: self.REGEX_NUMBER,
				},
			],
		},
		clockStop: {
			label: 'Stop Clock',
			options: [
				{
					type: 'textinput',
					label: 'Clock Number',
					id: 'clockIndex',
					default: 0,
					tooltip: 'Zero based index of countdown clock - first one is 0, second one is 1 and so on...',
					regex: self.REGEX_NUMBER,
				},
			],
		},
		clockReset: {
			label: 'Reset Clock',
			options: [
				{
					type: 'textinput',
					label: 'Clock Number',
					id: 'clockIndex',
					default: 0,
					tooltip: 'Zero based index of countdown clock - first one is 0, second one is 1 and so on...',
					regex: self.REGEX_NUMBER,
				},
			],
		},
		clockUpdate: {
			label: 'Update Clock',
			options: [
				{
					type: 'textinput',
					label: 'New Name For Clock', // Help person relise that this will rename clock that is updated.
					id: 'clockName',
					default: 'Timer',
					tooltip:
						'If this does not match the existing clock name, the clock name will be updated/renamed. Enter the existing clock name to leave it unchanged.',
				},
				{
					type: 'textinput',
					label: 'Clock Number',
					id: 'clockIndex',
					default: 0,
					tooltip: 'Zero based index of countdown clock - first one is 0, second one is 1 and so on...',
					regex: self.REGEX_NUMBER,
				},
				{
					type: 'textinput',
					label: 'Countdown Duration, Elapsed Start Time or Countdown To Time',
					id: 'clockTime',
					default: '00:05:00',
					tooltip:
						'New duration (or time) for countdown clocks. Also used as optional starting time for elapsed time clocks. Formatted as HH:MM:SS - but you can also use other (shorthand) formats, see the README for more information',
					regex: '/^\\d*:?\\d*:?\\d*$/',
				},
				{
					type: 'dropdown',
					label: 'Over Run',
					id: 'clockOverRun',
					default: 'false',
					choices: [
						{ id: 'false', label: 'False' },
						{ id: 'true', label: 'True' },
					],
				},
				{
					type: 'dropdown',
					label: 'Clock Type',
					id: 'clockType',
					default: '0',
					tooltip:
						'If the clock specified by the Clock Number is not of this type it will be UPDATED/CONVERTED this type.',
					choices: [
						{ id: '0', label: 'Countdown Timer' },
						{ id: '1', label: 'Countdown To Time' },
						{ id: '2', label: 'Elapsed Time' },
					],
				},
				{
					type: 'dropdown',
					label: 'Clock Time Format',
					id: 'clockTimePeriodFormat',
					default: '0',
					tooltip: 'Only Required for Countdown To Time Clock - otherwise this is ignored.',
					choices: [
						{ id: '0', label: 'AM' },
						{ id: '1', label: 'PM' },
						{ id: '2', label: '24Hr (Pro7 Only)' },
					],
				},
				{
					type: 'textinput',
					label: 'Elapsed End Time',
					id: 'clockElapsedTime',
					default: '00:10:00',
					tooltip: 'Only Required for Elapsed Time Clock - otherwise this is ignored.',
					regex: '/^\\d*:?\\d*:?\\d*$/',
				},
			],
		},
		messageSend: {
			label: 'Show Message',
			options: [
				{
					type: 'textinput',
					label: 'Message Index',
					id: 'messageIndex',
					default: '0',
					tooltip: 'Zero based index of message to show - first one is 0, second one is 1 and so on...',
					regex: self.REGEX_NUMBER,
				},
				{
					type: 'textinput',
					label: 'Comma Separated List Of Message Token Names',
					id: 'messageKeys',
					default: '',
					tooltip:
						'Comma separated, list of message token names used in the message.  Associated values are given below. Use double commas (,,) to insert an actual comma in a token name. (WARNING! - A simple typo here could crash and burn ProPresenter)',
				},
				{
					type: 'textinput',
					label: 'Comma Separated List Of Message Token Values',
					id: 'messageValues',
					default: '',
					tooltip:
						'Comma separated, list of values for each message token above. Use double commas (,,) to insert an actual comma in a token value. (WARNING! - A simple typo here could crash and burn ProPresenter)',
				},
			],
		},
		messageHide: {
			label: 'Hide Message',
			options: [
				{
					type: 'textinput',
					label: 'Message Index',
					id: 'messageIndex',
					default: '0',
					tooltip: 'Zero based index of message to hide - first one is 0, second one is 1 and so on...',
					regex: self.REGEX_NUMBER,
				},
			],
		},
		audioStartCue: {
			label: 'Audio Start Cue',
			options: [
				{
					type: 'textinput',
					label: 'Audio Item Playlist Path',
					id: 'audioChildPath',
					default: '',
					tooltip: 'PresentationPath format - See the README for more information',
					regex: '/^$|^\\d+$|^\\d+(\\.\\d+)*:\\d+$/',
				},
			],
		},
		audioPlayPause: { label: 'Audio Play/Pause' },
		timelinePlayPause: {
			label: 'Timeline Play/Pause',
			options: [
				{
					type: 'textinput',
					label: 'Presentation Path',
					id: 'presentationPath',
					default: '',
					tooltip: 'PresentationPath format - See the README for more information',
					regex: '/^$|^\\d+$|^\\d+(\\.\\d+)*:\\d+$/',
				},
			],
		},
		timelineRewind: {
			label: 'Timeline Rewind',
			options: [
				{
					type: 'textinput',
					label: 'Presentation Path',
					id: 'presentationPath',
					default: '',
					tooltip: 'PresentationPath format - See the README for more information',
					regex: '/^$|^\\d+$|^\\d+(\\.\\d+)*:\\d+$/',
				},
			],
		},
		enableFollowerControl: {
			label: 'Enable Follower Control',
			options: [
				{
					type: 'dropdown',
					label: 'Enable Follower Control',
					id: 'enableFollowerControl',
					default: 'false',
					choices: [
						{ id: 'no', label: 'No' },
						{ id: 'yes', label: 'Yes' },
					],
				},
			],
		},
		customAction: {
			label: 'Custom Action',
			options: [
				{
					type: 'textinput',
					label: 'Custom Action',
					id: 'customAction',
					default: '{"action":"customAction","customProperty":"customValue"}',
					tooltip:
						'Advanced use only. Must be a valid JSON action message that ProPresenter understands. An invalid message or even one little mistake can lead to crashes and data loss.',
				},
			],
		},
	})
}

/**
 * Action triggered by Companion.
 */
instance.prototype.action = function (action) {
	var self = this
	var opt = action.options

	switch (action.action) {
		case 'enableFollowerControl':
			self.config.control_follower = opt.enableFollowerControl
			self.checkFeedbacks('propresenter_follower_connected')
			cmd = undefined // No need to send any command to Pro7 - this is an internal only action
			break
		case 'next':
			cmd = {
				action: 'presentationTriggerNext',
				presentationDestination: '0', // Pro7.4.2 seems to need this now!
			}
			break

		case 'last':
			cmd = {
				action: 'presentationTriggerPrevious',
				presentationDestination: '0', // Pro7.4.2 seems to need this now!
			}
			break

		case 'slideNumber':
			var index = self.currentState.internal.slideIndex

			if (opt.slide[0] === '-' || opt.slide[0] === '+') {
				// Move back/forward a relative number of slides.
				index += parseInt(opt.slide.substring(1), 10) * (opt.slide[0] === '+' ? 1 : -1)
				index = Math.max(0, index)
			} else {
				// Absolute slide number. Convert to an index.
				index = parseInt(opt.slide) - 1
			}

			if (index < 0) {
				// Negative slide indexes are invalid. In such a case use the current slideIndex.
				// This allows the "Specific Slide", when set to 0 (thus the index is -1), to
				//  trigger the current slide again. Can be used to bring back a slide after using
				//  an action like 'clearAll' or 'clearText'.
				index = self.currentState.internal.slideIndex
			}

			var presentationPath = self.currentState.internal.presentationPath
			if (opt.path !== undefined && opt.path.match(/^\d+$/) !== null) {
				// Is a relative presentation path. Refers to the current playlist, so extract it
				//  from the current presentationPath and append the opt.path to it.
				presentationPath = presentationPath.split(':')[0] + ':' + opt.path
			} else if (opt.path !== '') {
				// Use the path provided. The option's regex validated the format.
				presentationPath = opt.path
			}

			cmd = {
				action: 'presentationTriggerIndex',
				slideIndex: String(index),
				// Pro 6 for Windows requires 'presentationPath' to be set.
				presentationPath: presentationPath,
			}
			break

		case 'clearall':
			cmd = {
				action: 'clearAll',
			}
			break

		case 'clearslide':
			cmd = {
				action: 'clearText',
			}
			break

		case 'clearprops':
			cmd = {
				action: 'clearProps',
			}
			break

		case 'clearaudio':
			cmd = {
				action: 'clearAudio',
			}
			break

		case 'clearbackground':
			cmd = {
				action: 'clearVideo',
			}
			break

		case 'cleartelestrator':
			cmd = {
				action: 'clearTelestrator',
			}
			break

		case 'cleartologo':
			cmd = {
				action: 'clearToLogo',
			}
			break

		case 'clearAnnouncements':
			cmd = {
				action: 'clearAnnouncements',
			}
			break

		case 'clearMessages':
			cmd = {
				action: 'clearMessages',
			}
			break

		case 'stageDisplayLayout':
			cmd = {
				action: 'stageDisplaySetIndex',
				stageDisplayIndex: String(opt.index),
			}
			break

		case 'pro7StageDisplayLayout':
			// If either option is null, then default to using first items from each list kept in internal state.
			cmd = {
				action: 'stageDisplayChangeLayout',
				stageScreenUUID: opt.pro7StageScreenUUID
					? opt.pro7StageScreenUUID
					: self.currentState.internal.pro7StageScreens[0].id,
				stageLayoutUUID: opt.pro7StageLayoutUUID
					? opt.pro7StageLayoutUUID
					: self.currentState.internal.pro7StageLayouts[0].id,
			}
			break

		case 'pro7SetLook':
			// If selected Look is null, then default to using first Look from list kept in internal state
			cmd = {
				action: 'looksTrigger',
				lookID: opt.pro7LookUUID ? opt.pro7LookUUID : self.currentState.internal.pro7Looks[0].id,
			}
			break

		case 'pro7TriggerMacro':
			// If selected Macro is null, then default to using first Macro from list kept in internal state
			cmd = {
				action: 'macrosTrigger',
				macroID: opt.pro7MacroUUID ? opt.pro7MacroUUID : self.currentState.internal.pro7Macros[0].id,
			}
			break

		case 'stageDisplayMessage':
			//var message = JSON.stringify(opt.message);
			//cmd = '{"action":"stageDisplaySendMessage","stageDisplayMessage":'+message+'}';
			cmd = {
				action: 'stageDisplaySendMessage',
				stageDisplayMessage: opt.message,
			}
			break

		case 'stageDisplayHideMessage':
			cmd = {
				action: 'stageDisplayHideMessage',
			}
			break

		case 'clockStart':
			var clockIndex = String(opt.clockIndex)
			cmd = {
				action: 'clockStart',
				clockIndex: clockIndex,
			}
			break

		case 'clockStop':
			var clockIndex = String(opt.clockIndex)
			cmd = {
				action: 'clockStop',
				clockIndex: clockIndex,
			}
			break

		case 'clockReset':
			var clockIndex = String(opt.clockIndex)
			cmd = {
				action: 'clockReset',
				clockIndex: clockIndex,
			}
			break

		case 'clockUpdate':
			var clockIndex = String(opt.clockIndex)

			// Protect against option values which may be missing if this action is called from buttons that were previously saved before these options were added to the clockUpdate action!
			// If they are missing, then apply default values that result in the oringial bahaviour when it was only updating a countdown timers clockTime and clockOverRun.
			if (!opt.hasOwnProperty('clockType')) {
				opt.clockType = '0'
			}
			if (!opt.hasOwnProperty('clockIsPM')) {
				opt.clockIsPM = '0'
			}
			if (!opt.hasOwnProperty('clockElapsedTime')) {
				opt.clockElapsedTime = '00:10:00'
			}
			if (!opt.hasOwnProperty('clockName')) {
				opt.clockName = ''
			}

			cmd = {
				action: 'clockUpdate',
				clockIndex: clockIndex,
				clockTime: opt.clockTime,
				clockOverrun: opt.clockOverRun,
				clockType: opt.clockType,
				clockIsPM: String(opt.clockTimePeriodFormat) < 2 ? String(opt.clockTimePeriodFormat) : '2', // Pro6 just wants a 1 (PM) or 0 (AM)
				clockTimePeriodFormat: String(opt.clockTimePeriodFormat),
				clockElapsedTime:
					opt.clockType === '1' && self.currentState.internal.proMajorVersion === 7
						? opt.clockTime
						: opt.clockElapsedTime, // When doing countdown to time (clockType==='1'), Pro7 uses clockElapsed value for the "countdown-to-time", so we grab this from clocktime above where the user has entered it (Pro6 uses clocktime for countdown-to-time value)
				clockName: opt.clockName,
			}
			break

		case 'messageHide':
			cmd = {
				action: 'messageHide',
				messageIndex: String(opt.messageIndex),
			}
			break

		case 'messageSend':
			// The below "replace...split dance" for messageKeys and MessageValues produces the required array of items from the comma-separated list of values entered by the user. It also allows double commas (,,) to be treated as an escape method for the user to include a literal comma in the values if desired.
			// It works by first replacing any double commas with a character 29, and then replacing any single commas with a character 28.  Then it can safely replace character 29 with a comma and finally split using character 28 as the separator.
			// Note that character 28 and 29 are not "normally typed characters" and therefore considered (somewhat) safe to insert into the string as special markers during processing. Also note that CharCode(29) is matched by regex /\u001D/
			cmd = {
				action: 'messageSend',
				messageIndex: String(opt.messageIndex),
				messageKeys: opt.messageKeys
					.replace(/,,/g, String.fromCharCode(29))
					.replace(/,/g, String.fromCharCode(28))
					.replace(/\u001D/g, ',')
					.split(String.fromCharCode(28)),
				messageValues: opt.messageValues
					.replace(/,,/g, String.fromCharCode(29))
					.replace(/,/g, String.fromCharCode(28))
					.replace(/\u001D/g, ',')
					.split(String.fromCharCode(28)),
			}
			break

		case 'audioStartCue':
			cmd = {
				action: 'audioStartCue',
				audioChildPath: opt.audioChildPath,
			}
			break

		case 'audioPlayPause':
			cmd = {
				action: 'audioPlayPause',
			}
			break
		case 'timelinePlayPause':
			cmd = {
				action: 'timelinePlayPause',
				presentationPath: opt.presentationPath,
			}
			break
		case 'timelineRewind':
			cmd = {
				action: 'timelineRewind',
				presentationPath: opt.presentationPath,
			}
			break
		case 'customAction':
			try {
				cmd = JSON.parse(opt.customAction)
			} catch (err) {
				self.log('debug', 'Failed to convert custom action: ' + customAction + ' to valid JS object: ' + err.message)
			}
			break
	}

	if (cmd !== undefined) {
		if (self.currentStatus !== self.STATUS_ERROR) {
			try {
				var cmdJSON = JSON.stringify(cmd)
				self.socket.send(cmdJSON)
			} catch (e) {
				debug('NETWORK ' + e)
				self.status(self.STATUS_ERROR, e)
			}
		} else {
			debug('Socket not connected :(')
			self.status(self.STATUS_ERROR)
		}
	}
}

instance.prototype.init_feedbacks = function () {
	var self = this

	var feedbacks = {}
	feedbacks['stagedisplay_active'] = {
		label: 'Change colors based on active stage display',
		description: 'If the specified stage display is active, change colors of the bank',
		options: [
			{
				type: 'colorpicker',
				label: 'Foreground color',
				id: 'fg',
				default: self.rgb(255, 255, 255),
			},
			{
				type: 'colorpicker',
				label: 'Background color',
				id: 'bg',
				default: self.rgb(0, 153, 51),
			},
			{
				type: 'textinput',
				label: 'Stage Display Index',
				id: 'index',
				default: 0,
				regex: self.REGEX_NUMBER,
			},
		],
	}

	feedbacks['pro7_stagelayout_active'] = {
		label: "Change colors based on the active layout for one of Pro7's stage screens",
		description: 'If the specified stage layout is active on the specified stage screen, change colors of the bank',
		options: [
			{
				type: 'colorpicker',
				label: 'Foreground color',
				id: 'fg',
				default: self.rgb(255, 255, 255),
			},
			{
				type: 'colorpicker',
				label: 'Background color',
				id: 'bg',
				default: self.rgb(0, 153, 51),
			},
			{
				type: 'dropdown',
				label: 'Pro7 Stage Display Screen',
				id: 'pro7StageScreenUUID',
				tooltip: 'Choose which stage display screen you want to monitor',
				choices: self.currentState.internal.pro7StageScreens,
			},
			{
				type: 'dropdown',
				label: 'Pro7 Stage Display Layout',
				id: 'pro7StageLayoutUUID',
				tooltip: 'Choose the stage display layout to trigger above color change',
				choices: self.currentState.internal.pro7StageLayouts,
			},
		],
	}

	feedbacks['propresenter_module_connected'] = {
		label: 'Change colors based on Propresenter module being connected',
		description: 'Propresenter module being connected, change colors of the bank',
		options: [
			{
				type: 'colorpicker',
				label: 'Connected Foreground color',
				id: 'cfg',
				default: self.rgb(255, 255, 255),
			},
			{
				type: 'colorpicker',
				label: 'Connected Background color',
				id: 'cbg',
				default: self.rgb(0, 153, 51),
			},
			{
				type: 'colorpicker',
				label: 'Disconnected Foreground color',
				id: 'dfg',
				default: self.rgb(255, 255, 255),
			},
			{
				type: 'colorpicker',
				label: 'Disconnected Background color',
				id: 'dbg',
				default: self.rgb(204, 0, 0),
			},
		],
	}

	feedbacks['propresenter_follower_connected'] = {
		label: 'Change colors based on Propresenter follower being connected',
		description: 'Propresenter follower being connected, change colors of the bank',
		options: [
			{
				type: 'colorpicker',
				label: 'Connected & Controlled Foreground color',
				id: 'fcfg',
				default: self.rgb(255, 255, 255),
			},
			{
				type: 'colorpicker',
				label: 'Connected & Controlled Background color',
				id: 'fcbg',
				default: self.rgb(0, 153, 51),
			},
			{
				type: 'colorpicker',
				label: 'Connected & Control Disabled Foreground color',
				id: 'fcdfg',
				default: self.rgb(255, 255, 255),
			},
			{
				type: 'colorpicker',
				label: 'Connected & Control Disabled Background color',
				id: 'fcdbg',
				default: self.rgb(255, 102, 10),
			},
			{
				type: 'colorpicker',
				label: 'Disconnected Foreground color',
				id: 'fdfg',
				default: self.rgb(255, 255, 255),
			},
			{
				type: 'colorpicker',
				label: 'Disconnected Background color',
				id: 'fdbg',
				default: self.rgb(204, 0, 0),
			},
		],
	}

	self.setFeedbackDefinitions(feedbacks)
}

instance.prototype.feedback = function (feedback, bank) {
	var self = this

	self.log('debug', 'feedback type: ' + feedback.type)

	if (feedback.type == 'stagedisplay_active') {
		if (self.currentState.internal.stageDisplayIndex == feedback.options.index) {
			return { color: feedback.options.fg, bgcolor: feedback.options.bg }
		}
	}

	if (feedback.type == 'propresenter_module_connected') {
		if (self.currentState.internal.wsConnected) {
			return { color: feedback.options.cfg, bgcolor: feedback.options.cbg }
		} else {
			return { color: feedback.options.dfg, bgcolor: feedback.options.dbg }
		}
	}

	if (feedback.type == 'propresenter_follower_connected') {
		if (self.currentState.internal.wsFollowerConnected) {
			if (self.config.control_follower === 'yes') {
				return { color: feedback.options.fcfg, bgcolor: feedback.options.fcbg }
			} else {
				return { color: feedback.options.fcdfg, bgcolor: feedback.options.fcdbg }
			}
		} else {
			return { color: feedback.options.fdfg, bgcolor: feedback.options.fdbg }
		}
	}

	if (feedback.type == 'pro7_stagelayout_active') {
		// Get screen (includes current layout)
		var stageScreen = self.currentState.internal.pro7StageScreens.find(
			(pro7StageScreen) =>
				pro7StageScreen.id ===
				(feedback.options.pro7StageScreenUUID
					? feedback.options.pro7StageScreenUUID
					: self.currentState.internal.pro7StageScreens[0].id)
		)

		self.log('debug', 'feedback for ' + feedback.options.pro7StageScreenUUID)

		// Exit if we could not find matching screen
		if (stageScreen === undefined) {
			return
		}

		// Check stage layout for screeen and return feedback color if matched
		if (
			stageScreen.layoutUUID ===
			(feedback.options.pro7StageLayoutUUID
				? feedback.options.pro7StageLayoutUUID
				: self.currentState.internal.pro7StageLayouts[0].id)
		) {
			return { color: feedback.options.fg, bgcolor: feedback.options.bg }
		}
	}
}

/**
 * Received a message from ProPresenter.
 */
instance.prototype.onWebSocketMessage = function (message) {
	var self = this
	var objData
	// Try to parse websocket payload as JSON...
	try {
		objData = JSON.parse(message)
	} catch (err) {
		self.log('warn', err.message)
		return
	}

	switch (objData.action) {
		case 'authenticate':
			if (objData.authenticated === 1) {
				// Autodetect if Major version of ProPresenter is version 7
				// Only Pro7 includes .majorVersion and .minorVersion properties.
				// .majorVersion will be set to = "7" from Pro7 (Pro6 does not include these at all)
				if (objData.hasOwnProperty('majorVersion')) {
					if (objData.majorVersion === 7) {
						self.currentState.internal.proMajorVersion = 7
					}
				} else {
					// Leave default
				}

				self.log('info', 'Authenticated to ProPresenter (Version: ' + self.currentState.internal.proMajorVersion + ')')
				self.status(self.STATE_OK)
				self.currentState.internal.wsConnected = true
				// Successfully authenticated. Request current state.
				self.setConnectionVariable('Connected', true)
				self.getProPresenterState()
				self.init_feedbacks()
				// Get current Stage Display (index and Name)
				self.getStageDisplaysInfo()
				// Get current Pro7 Macros & Looks List.
				if (self.currentState.internal.proMajorVersion >= 7) {
					self.getMacrosList()
					self.getLooksList()
				}

				// Ask Pro6 to start sending clock updates (they are sent once per second)
				self.socket.send(
					JSON.stringify({
						action: 'clockStartSendingCurrentTime',
					})
				)
			} else {
				self.status(self.STATUS_ERROR)
				// Bad password
				self.log('warn', 'Failed to authenticate to ProPresenter. ' + objData.error)
				self.disconnectFromProPresenter()

				// No point in trying to connect again. The user must either re-enable this
				//	module or re-save the config changes to make another attempt.
				self.stopConnectionTimer()
			}
			break

		case 'presentationTriggerIndex':
		case 'presentationSlideIndex':
			// Update the current slide index.
			var slideIndex = parseInt(objData.slideIndex, 10)

			self.currentState.internal.slideIndex = slideIndex
			self.updateVariable('current_slide', slideIndex + 1)
			if (objData.presentationPath == self.currentState.internal.presentationPath) {
				// If the triggered slide is part of the current presentation (for which we have stored the total slides) then update the 'remaining_slides' dynamic variable
				// Note that, if the triggered slide is NOT part of the current presentation, the 'remaining_slides' dynamic variable will be updated later when we call the presentationCurrent action to refresh current presentation info.
				self.updateVariable('remaining_slides', self.currentState.dynamicVariables['total_slides'] - slideIndex - 1)
			}

			// Workaround for bug that occurs when a presentation with automatically triggered slides (eg go-to-next timer), fires one of it's slides while *another* presentation is selected and before any slides within the newly selected presentation are fired. This will lead to total_slides being wrong (and staying wrong) even after the user fires slides within the newly selected presentation.
			setTimeout(function () {
				self.getProPresenterState()
			}, 800)
			self.log('debug', 'presentationSlideIndex: ' + slideIndex)

			// Trigger same slide in follower ProPresenter (If configured and connected)
			if (self.config.control_follower === 'yes' && self.currentState.internal.wsFollowerConnected) {
				cmd = {
					action: 'presentationTriggerIndex',
					slideIndex: String(slideIndex),
					// Pro 6 for Windows requires 'presentationPath' to be set.
					presentationPath: objData.presentationPath,
				}
				self.log('debug', 'Forwarding command to Follower: ' + JSON.stringify(cmd))
				try {
					var cmdJSON = JSON.stringify(cmd)
					self.followersocket.send(cmdJSON)
				} catch (e) {
					debug('Follower NETWORK ' + e)
					self.status(self.STATUS_WARNING, e)
				}
			}

			break

		case 'clearText':
			// Forward command to follower (Only if clearText is recieved twice less than 300msec apart - Since Pro7.4.1 on Windows sends clearText for every slide and send it twice for real clearText action)
			var timeOfThisClearMessage = new Date()
			if (
				self.config.control_follower === 'yes' &&
				self.currentState.internal.wsFollowerConnected &&
				self.currentState.internal.previousTimeOfLeaderClearMessage != null &&
				timeOfThisClearMessage.getTime() - self.currentState.internal.previousTimeOfLeaderClearMessage.getTime() < 300
			) {
				cmd = {
					action: 'clearText',
				}
				self.log('debug', 'Forwarding command to Follower: ' + JSON.stringify(cmd))
				try {
					var cmdJSON = JSON.stringify(cmd)
					self.followersocket.send(cmdJSON)
				} catch (e) {
					debug('Follower NETWORK ' + e)
					self.status(self.STATUS_WARNING, e)
				}
			}
			self.currentState.internal.previousTimeOfLeaderClearMessage = timeOfThisClearMessage
			break

		case 'clearAll':
			// Forward command to follower
			if (self.config.control_follower === 'yes' && self.currentState.internal.wsFollowerConnected) {
				cmd = {
					action: 'clearAll',
				}
				self.log('debug', 'Forwarding command to Follower: ' + JSON.stringify(cmd))
				try {
					var cmdJSON = JSON.stringify(cmd)
					self.followersocket.send(cmdJSON)
				} catch (e) {
					debug('Follower NETWORK ' + e)
					self.status(self.STATUS_WARNING, e)
				}
			}
			break

		case 'clearVideo':
			// Forward command to follower
			if (self.config.control_follower === 'yes' && self.currentState.internal.wsFollowerConnected) {
				cmd = {
					action: 'clearVideo',
				}
				self.log('debug', 'Forwarding command to Follower: ' + JSON.stringify(cmd))
				try {
					var cmdJSON = JSON.stringify(cmd)
					self.followersocket.send(cmdJSON)
				} catch (e) {
					debug('Follower NETWORK ' + e)
					self.status(self.STATUS_WARNING, e)
				}
			}
			break

		case 'clearAudio':
			// Forward command to follower
			if (self.config.control_follower === 'yes' && self.currentState.internal.wsFollowerConnected) {
				cmd = {
					action: 'clearAudio',
				}
				self.log('debug', 'Forwarding command to Follower: ' + JSON.stringify(cmd))
				try {
					var cmdJSON = JSON.stringify(cmd)
					self.followersocket.send(cmdJSON)
				} catch (e) {
					debug('Follower NETWORK ' + e)
					self.status(self.STATUS_WARNING, e)
				}
			}
			break

		case 'presentationCurrent':
			var objPresentation = objData.presentation

			// If playing from the library on Mac, the presentationPath here will be the full
			//	path to the document on the user's computer ('/Users/JohnDoe/.../filename.pro6'),
			//  which differs from objData.presentationPath returned by an action like
			//  'presentationTriggerIndex' or 'presentationSlideIndex' which only contains the
			//  filename.
			// These two values need to match or we'll re-request 'presentationCurrent' on every
			//  slide change. Strip off everything before and including the final '/'.
			objData.presentationPath = objData.presentationPath.replace(/.*\//, '')

			// Pro6 PC's 'presentationName' contains the raw file extension '.pro6'. Remove it.
			var presentationName = objPresentation.presentationName.replace(/\.pro6$/i, '')
			self.updateVariable('presentation_name', presentationName)

			// '.presentationPath' and '.presentation.presentationCurrentLocation' look to be
			//	the same on Pro6 Mac, but '.presentation.presentationCurrentLocation' is the
			//	wrong value on Pro6 PC (tested 6.1.6.2). Use '.presentationPath' instead.
			self.currentState.internal.presentationPath = objData.presentationPath

			// Get the total number of slides in this presentation
			var totalSlides = 0
			for (var i = 0; i < objPresentation.presentationSlideGroups.length; i++) {
				totalSlides += objPresentation.presentationSlideGroups[i].groupSlides.length
			}

			self.updateVariable('total_slides', totalSlides)

			// Update remaining_slides (as total_slides has probably just changed)
			self.updateVariable(
				'remaining_slides',
				self.currentState.dynamicVariables['total_slides'] - self.currentState.dynamicVariables['current_slide']
			)

			self.log('info', 'presentationCurrent: ' + presentationName)
			break

		case 'clockCurrentTimes':
			var objWatchedClock = objData.clockTimes
			if (self.config.indexOfClockToWatch >= 0 && self.config.indexOfClockToWatch < objData.clockTimes.length) {
				self.updateVariable('watched_clock_current_time', objData.clockTimes[self.config.indexOfClockToWatch])
			}
			break

		case 'stageDisplaySetIndex': // Companion User (or someone else) has set a new Stage Display Layout in Pro6 (Time to refresh stage display dynamic variables)
			if (self.currentState.internal.proMajorVersion === 6) {
				var stageDisplayIndex = objData.stageDisplayIndex
				self.currentState.internal.stageDisplayIndex = parseInt(stageDisplayIndex, 10)
				self.updateVariable('current_stage_display_index', stageDisplayIndex)
				self.getStageDisplaysInfo()
				self.checkFeedbacks('stagedisplay_active')
			}
			break

		case 'stageDisplaySets': // The response from sending stageDisplaySets is a reply that includes an array of Stage Display Layout Names, and also stageDisplayIndex set to the index of the currently selected layout
			if (self.currentState.internal.proMajorVersion === 6) {
				// Handle Pro6 Stage Display Info...
				var stageDisplaySets = objData.stageDisplaySets
				var stageDisplayIndex = objData.stageDisplayIndex
				self.currentState.internal.stageDisplayIndex = parseInt(stageDisplayIndex, 10)
				self.updateVariable('current_stage_display_index', stageDisplayIndex)
				self.updateVariable('current_stage_display_name', stageDisplaySets[parseInt(stageDisplayIndex, 10)])
				self.checkFeedbacks('stagedisplay_active')
			} else if (self.currentState.internal.proMajorVersion === 7) {
				// Handle Pro7 Stage Display Info...
				var watchScreen_StageLayoutSelectedLayoutUUID = ''

				// Refresh list of all stagelayouts
				if (objData.hasOwnProperty('stageLayouts')) {
					self.currentState.internal.pro7StageLayouts = []
					objData.stageLayouts.forEach(function (stageLayout) {
						self.currentState.internal.pro7StageLayouts.push({
							id: stageLayout['stageLayoutUUID'],
							label: stageLayout['stageLayoutName'],
						})
					})
				}

				// Refresh list of stage screens, update the records of screen names (and layout UUID), and record UUID of the current_pro7_stage_layout_name for selected watched screen
				if (objData.hasOwnProperty('stageScreens')) {
					self.currentState.internal.pro7StageScreens = []
					objData.stageScreens.forEach(function (stageScreen) {
						var stageScreenName = stageScreen['stageScreenName']
						var stageScreenUUID = stageScreen['stageScreenUUID']
						var stageLayoutSelectedLayoutUUID = stageScreen['stageLayoutSelectedLayoutUUID']
						self.currentState.internal.pro7StageScreens.push({
							id: stageScreenUUID,
							label: stageScreenName,
							layoutUUID: stageLayoutSelectedLayoutUUID,
						})

						// Update record of layout name for this pro7 stage screen
						try {
							self.currentState.dynamicVariables[stageScreenName + '_pro7_stagelayoutname'] =
								self.currentState.internal.pro7StageLayouts.find(
									(pro7StageLayout) => pro7StageLayout.id === stageLayoutSelectedLayoutUUID
								).label
							self.updateVariable(
								stageScreenName + '_pro7_stagelayoutname',
								self.currentState.dynamicVariables[stageScreenName + '_pro7_stagelayoutname']
							)
						} catch (e) {
							self.log(
								'warn',
								'Error finding/updating layout name for ' + stageScreenName + '_pro7_stagelayoutname. ' + e.message
							)
						}

						// Capture the UUID of the current_pro7_stage_layout_name for selected watched screen
						if (stageScreenUUID === self.config.GUIDOfStageDisplayScreenToWatch) {
							watchScreen_StageLayoutSelectedLayoutUUID = stageLayoutSelectedLayoutUUID
							self.currentState.internal.stageDisplayIndex = self.currentState.internal.pro7StageLayouts
								.map(function (x) {
									return x.id
								})
								.indexOf(watchScreen_StageLayoutSelectedLayoutUUID)
							self.checkFeedbacks('stagedisplay_active')
						}
					})
				}

				// Update current_pro7_stage_layout_name
				if (objData.hasOwnProperty('stageLayouts')) {
					objData.stageLayouts.forEach(function (stageLayout) {
						if (stageLayout['stageLayoutUUID'] === watchScreen_StageLayoutSelectedLayoutUUID) {
							self.updateVariable('current_pro7_stage_layout_name', stageLayout['stageLayoutName'])
						}
					})
				}

				self.checkFeedbacks('pro7_stagelayout_active')

				self.log('info', 'Got Pro7 Stage Display Sets')
				self.actions() // Update dropdown lists for screens and layouts used in pro7 stagedispay action.
				self.init_feedbacks() // Update dropdown lists for pro7 stage layout feedback.
			}
			break

		case 'looksRequest': // Response from sending looksRequest
			if (objData.hasOwnProperty('looks')) {
				self.currentState.internal.pro7Looks = []
				objData.looks.forEach(function (look) {
					var lookName = look['lookName']
					var lookID = look['lookID']
					self.currentState.internal.pro7Looks.push({ id: lookID, label: lookName })
				})
				// Update dyn var for current look name
				self.updateVariable('current_pro7_look_name', objData.activeLook.lookName)

				self.log('info', objData.activeLook.lookName)
				self.log('info', 'Got Pro7 Looks List')
				self.actions() // Update dropdown lists for Looks
			}
			break

		case 'macrosRequest': // Response from sending macrosRequest
			if (objData.hasOwnProperty('macros')) {
				self.currentState.internal.pro7Macros = []
				objData.macros.forEach(function (look) {
					var macroName = look['macroName']
					var macroID = look['macroID']
					self.currentState.internal.pro7Macros.push({ id: macroID, label: macroName })
				})

				self.log('info', 'Got Pro7 Macros List')
				self.actions() // Update dropdown lists for Looks
			}
	}

	if (
		objData.presentationPath !== undefined &&
		objData.presentationPath !== self.currentState.internal.presentationPath
	) {
		// The presentationPath has changed. Update the path and request the information.
		self.getProPresenterState()
	}
}

/**
 * Received a message from Follower ProPresenter.
 */
instance.prototype.onFollowerWebSocketMessage = function (message) {
	var self = this
	var objData
	// Try to parse websocket payload as JSON...
	try {
		objData = JSON.parse(message)
	} catch (err) {
		self.log('warn', err.message)
		return
	}

	switch (objData.action) {
		case 'authenticate':
			if (objData.authenticated === 1) {
				// Autodetect if Major version of ProPresenter is version 7
				// Only Pro7 includes .majorVersion and .minorVersion properties.
				// .majorVersion will be set to = "7" from Pro7 (Pro6 does not include these at all)
				if (objData.hasOwnProperty('majorVersion')) {
					self.log('info', 'Authenticated to Follower ProPresenter (Version: ' + objData.majorVersion + ')')
				}

				self.currentState.internal.wsFollowerConnected = true

				self.checkFeedbacks('propresenter_follower_connected')
			} else {
				self.status(self.STATUS_WARNING)
				self.log('warn', 'Failed to authenticate to Follower ProPresenter' + objData.error)
				self.disconnectFromFollowerProPresenter()

				// No point in trying to connect again. The user must either re-enable this
				//	module or re-save the config changes to make another attempt.
				self.stopFollowerConnectionTimer()

				self.currentState.internal.wsFollowerConnected = false
			}
			break

		case 'presentationTriggerIndex':
		case 'presentationSlideIndex':
			// Update the current slide index.
			var slideIndex = parseInt(objData.slideIndex, 10)
			self.log('debug', 'Follower presentationSlideIndex: ' + slideIndex)
			break

		case 'presentationCurrent':
			var objPresentation = objData.presentation

			// Pro6 PC's 'presentationName' contains the raw file extension '.pro6'. Remove it.
			var presentationName = objPresentation.presentationName.replace(/\.pro6$/i, '')
			self.log('info', 'Follower presentationCurrent: ' + presentationName)
			break

		case 'clockCurrentTimes':
			break

		case 'stageDisplaySetIndex':
			break

		case 'stageDisplaySets':
			break
	}
}

/**
 * Received a stage display message from ProPresenter.
 */
instance.prototype.onSDWebSocketMessage = function (message) {
	var self = this
	var objData = JSON.parse(message)
	switch (objData.acn) {
		case 'ath':
			if (objData.ath === true) {
				self.currentState.internal.wsSDConnected = true
				// Successfully authenticated.
				self.setSDConnectionVariable('Connected', true)
				self.status(self.STATE_OK)
			} else {
				// Bad password
				if (self.config.use_sd === 'yes') {
					self.status(self.STATUS_WARNING, 'OK, But Stage Display failed auth')
					self.log('warn', 'Stage Display auth error: ' + String(objData.err))
				}
				self.stopSDConnectionTimer()
			}
			break

		case 'vid':
			if (objData.hasOwnProperty('txt')) {
				// Record new video countdown timer value in dynamic var
				self.updateVariable('video_countdown_timer', objData.txt)
			}
			break
	}
}

/**
 * Requests the current state from ProPresenter.
 */
instance.prototype.getProPresenterState = function () {
	var self = this

	if (self.currentState.internal.wsConnected === false) {
		return
	}
	if (self.config.sendPresentationCurrentMsgs !== 'no') {
		// User can optionally block sending these msgs to ProPresenter (as it can cause performance issues with Pro7)
		self.socket.send(
			JSON.stringify({
				action: 'presentationCurrent',
				presentationSlideQuality: '0', // Setting to 0 stops Pro6 from including the slide preview image data (which is a lot of data) - no need to get slide preview images since we are not using them!
			})
		)
	}

	if (self.currentState.dynamicVariables.current_slide === 'N/A') {
		// The currentSlide will be empty when the module first loads. Request it.
		self.socket.send(
			JSON.stringify({
				action: 'presentationSlideIndex',
			})
		)
	}
}

/*
 * Requests the list of configured stage displays (includes names)
 */
instance.prototype.getStageDisplaysInfo = function () {
	var self = this

	if (self.currentState.internal.wsConnected === false) {
		return
	}

	self.socket.send(
		JSON.stringify({
			action: 'stageDisplaySets',
		})
	)
}

/*
 * Request Looks List
 */
instance.prototype.getLooksList = function () {
	var self = this

	if (self.currentState.internal.wsConnected === false) {
		return
	}

	self.socket.send(
		JSON.stringify({
			action: 'looksRequest',
		})
	)
}

/*
 * Request Macros List
 */
instance.prototype.getMacrosList = function () {
	var self = this

	if (self.currentState.internal.wsConnected === false) {
		return
	}

	self.socket.send(
		JSON.stringify({
			action: 'macrosRequest',
		})
	)
}

instance_skel.extendedBy(instance)
exports = module.exports = instance
