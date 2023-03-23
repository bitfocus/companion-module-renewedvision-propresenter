const { WebSocket } = require('ws')
const { InstanceBase, runEntrypoint, combineRgb, InstanceStatus } = require('@companion-module/base')
const { GetActions } = require('./actions')

class instance extends InstanceBase {
	constructor(internal) {
		super(internal)
	}

	/**
	 * Module is starting up.
	 */
	async init(config) {
		this.initVariables()

		await this.configUpdated(config)

		if (this.config.host !== '' && this.config.port !== '') {
			this.connectToProPresenter()
			this.startConnectionTimer()

			// Enabled Looks polling timer (which will only send looksRequests if option is enabled)
			this.startWatchDogTimer()

			if (this.config.use_sd === 'yes') {
				this.startSDConnectionTimer()
				this.connectToProPresenterSD()
			}
			if (this.config.control_follower === 'yes') {
				this.startFollowerConnectionTimer()
				this.connectToFollowerProPresenter()
			}
		}
		this.awaiting_reply = false
		this.command_queue = []

		this.setActionDefinitions(GetActions(this))
	}

	/**
	 * When the module gets deleted.
	 */
	async destroy() {
		this.disconnectFromProPresenter()
		this.disconnectFromProPresenterSD()
		this.stopConnectionTimer()
		this.stopSDConnectionTimer()
		this.stopWatchDogTimer()

		this.log('debug', 'destroy: ' + this.id)
	}

	/**
	 * The current state of ProPresenter.
	 * Initially populated by emptyCurrentState().
	 *
	 * .internal contains the internal state of the module
	 * .dynamicVariable contains the values of the dynamic variables
	 * .dynamicVariablesDefs contains the definitions of the dynamic variables - this list is passed to this.setVariableDefinitions() so  WebUI etc can know what the module vars are.
	 */
	currentState = {
		internal: {},
		dynamicVariables: {},
		dynamicVariablesDefs: [],
	}

	/**
	 * Return config fields for web config
	 */
	getConfigFields() {
		return [
			// ********** Required Settings ************
			{
				type: 'static-text',
				id: 'info',
				width: 12,
				label: '',
				value: '<br>', // Dummy space to separate settings into obvious sections
			},
			{
				type: 'static-text',
				id: 'info',
				width: 12,
				label: 'Required Settings',
				value:
					"These settings are required by this module to communicate with Renewed Vision's ProPresenter 6 or 7.<br>Make sure to enable Network and ProPresenter Remote Controller Password in ProPresenter Preferences",
			},
			{
				type: 'textinput',
				id: 'host',
				label: 'ProPresenter IP (or hostname)',
				width: 6,
				default: '',
			},
			{
				type: 'textinput',
				id: 'port',
				label: 'ProPresenter Port',
				width: 6,
				default: '20652',
				regex: this.REGEX_PORT,
			},
			{
				type: 'textinput',
				id: 'pass',
				label: 'ProPresenter Remote Controller Password',
				width: 6,
			},
			{
				type: 'static-text',
				id: 'info',
				width: 12,
				label: '',
				value: '<br>', // Dummy space to separate settings into obvious sections
			},
			// ********** Stage Display Settings ************
			{
				type: 'static-text',
				id: 'info',
				width: 12,
				label: 'Stage Display Settings (Optional)',
				value:
					'The following fields are only needed if you want to track the video countdown timer in a module variable.',
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
				type: 'static-text',
				id: 'info',
				width: 12,
				label: '',
				value: '<br>', // Dummy space to separate settings into obvious sections
			},
			// ********** Backwards Compatibility Settings ************
			{
				type: 'static-text',
				id: 'info',
				width: 12,
				label: 'Backwards Compatibility Settings (Optional)',
				value:
					'These settings are optional. They provide backwards compatibility for older features that are not longer required for new users/setups and newer features have been added that supersede them',
			},
			{
				type: 'textinput',
				id: 'indexOfClockToWatch',
				label: 'Index of Clock to Watch',
				tooltip:
					'Index of clock to watch.  Dynamic variable "watched_clock_current_time" will be updated with current value once every second.',
				default: '0',
				width: 4,
				regex: this.REGEX_NUMBER,
			},
			{
				type: 'dropdown',
				id: 'GUIDOfStageDisplayScreenToWatch',
				label: 'Pro7 Stage Display Screen To Monitor Layout',
				tooltip:
					'Pro7 Stage Display Screen To Monitor Layout - (This list is refreshed the next time you EDIT config, after a succesful connection)',
				default: '',
				width: 6,
				choices: this.currentState.internal.pro7StageScreens,
			},
			{
				type: 'static-text',
				id: 'info',
				width: 12,
				label: '',
				value: '<br>', // Dummy space to separate settings into obvious sections
			},
			// ********** Workaround Settings ************
			{
				type: 'static-text',
				id: 'info',
				width: 12,
				label: 'Workaround Settings (Optional)',
				value: 'These settings are optional. They provide "Workarounds" that might be needed for some setups.',
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
				type: 'dropdown',
				id: 'typeOfPresentationRequest',
				label: 'Type of Presentation Info Requests',
				default: 'auto',
				tooltip: 'Manual may workaround performance issues for some users - give it a try',
				width: 6,
				choices: [
					{ id: 'auto', label: 'Automatic' },
					{ id: 'manual', label: 'Manual' },
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
				type: 'dropdown',
				id: 'looksPolling', // Pro 7.8 on MacOs already sends notifications for look changes - but Pro 7.8.2 does not - so added this optional poll to enabled look feedback
				label: 'Looks Polling',
				default: 'disabled',
				tooltip: 'Poll ProPresenter Looks info once per second to enable Feedback for Active Look',
				width: 6,
				choices: [
					{ id: 'disabled', label: 'Disabled' },
					{ id: 'enabled', label: 'Enabled' },
				],
			},
			{
				type: 'dropdown',
				id: 'timerPolling', // Pro 7.92 onwards on MacOs no longer sends timer updates when clockStartSendingCurrentTime action is sent - instead, we must manually poll timers
				label: 'Timer Polling',
				default: 'disabled',
				tooltip:
					'Poll ProPresenter Timers values once per second to enable timer feedback. This workaround is only needed for some versions of Pro7 on MacOS - eg 7.9.2, 7.10, 7.10.2...',
				width: 6,
				choices: [
					{ id: 'disabled', label: 'Disabled' },
					{ id: 'enabled', label: 'Enabled' },
				],
			},
			{
				type: 'static-text',
				id: 'info',
				width: 12,
				label: '',
				value: '<br><br>', // Dummy space to separate settings into obvious sections
			},
			// ********** Pro7 Follower Settings ************
			{
				type: 'static-text',
				id: 'info2',
				width: 12,
				label: 'Pro7 Follower Settings (Optional)',
				value: 'Optional *Beta* feature to mimic Pro6 Master-Control module. (No longer needed for Pro7.8+ users)',
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
				regex: this.REGEX_IP,
			},
			{
				type: 'textinput',
				id: 'followerport',
				label: 'Follower-ProPresenter Port',
				width: 6,
				default: '20652',
				regex: this.REGEX_PORT,
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
	async configUpdated(config) {
		this.config = config
		this.init_presets()
		this.disconnectFromProPresenter()
		this.disconnectFromProPresenterSD()
		this.connectToProPresenter()
		this.startConnectionTimer()
		if (this.config.use_sd === 'yes') {
			this.connectToProPresenterSD()
			this.startSDConnectionTimer()
		} else {
			this.stopSDConnectionTimer()
		}

		if (this.config.control_follower === 'yes') {
			this.connectToFollowerProPresenter()
			this.startFollowerConnectionTimer()
		} else {
			this.stopFollowerConnectionTimer()
		}
	}

	/**
	 * Define button presets
	 */
	init_presets() {
		const presets = {}

		presets['displayname'] = {
			type: 'button',
			category: 'Stage Display',
			name: 'This button displays the name of current stage display layout. Pressing it will toggle back and forth between the two selected stage display layouts in the down and up actions.',
			style: {
				text: '$(propresenter:current_stage_display_name)',
				size: '18',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(153, 0, 255),
			},
			steps: [
				{
					down: [
						{
							actionId: 'stageDisplayLayout',
							options: {
								index: 0,
							},
						},
					],
					up: [],
				},
				{
					down: [
						{
							actionId: 'stageDisplayLayout',
							options: {
								index: 1,
							},
						},
					],
					up: [],
				},
			],
			feedbacks: [],
		}
		presets['select_layout'] = {
			type: 'button',

			category: 'Stage Display',
			name: 'This button will activate the selected (by index) stage display layout.',
			style: {
				text: 'Select Layout',
				size: '18',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(153, 0, 255),
			},
			steps: [
				{
					down: [
						{
							actionId: 'stageDisplayLayout',
							options: {
								index: 0,
							},
						},
					],
					up: [],
				},
			],
			feedbacks: [],
		}
		presets['clock_5min'] = {
			type: 'button',

			category: 'Countdown Clocks',
			name: 'This button will reset a selected (by index) clock to a 5 min countdown clock and automatically start it.',
			style: {
				text: 'Clock ' + this.config.indexOfClockToWatch + '\\n5 mins',
				size: '18',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(0, 153, 51),
			},
			steps: [
				{
					down: [
						{
							actionId: 'clockUpdate',
							options: {
								clockIndex: this.config.indexOfClockToWatch, // N.B. If user updates indexOfClockToWatch, this preset default will not be updated until module is reloaded.
								clockTime: '00:05:00',
								clockOverRun: 'false',
								clockType: 0,
							},
						},
						{
							actionId: 'clockReset',
							delay: 100,
							options: {
								clockIndex: this.config.indexOfClockToWatch, // N.B. If user updates indexOfClockToWatch, this preset default will not be updated until module is reloaded.
							},
						},
						{
							actionId: 'clockStart',
							delay: 200,
							options: {
								clockIndex: this.config.indexOfClockToWatch, // N.B. If user updates indexOfClockToWatch, this preset default will not be updated until module is reloaded.
							},
						},
					],
				},
			],
			feedbacks: [],
		}
		presets['clock_start'] = {
			type: 'button',

			category: 'Countdown Clocks',
			name: 'This button will START a clock selected by index (0-based). If you change the index, and still want to display the current time on the button, make sure to also update the index of the clock to watch in this modules config to match.',
			style: {
				text: 'Start\\nClock ' + this.config.indexOfClockToWatch + '\\n$(propresenter:watched_clock_current_time)',
				size: '14',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(0, 153, 51),
			},
			steps: [
				{
					down: [
						{
							actionId: 'clockStart',
							options: {
								clockIndex: this.config.indexOfClockToWatch, // N.B. If user updates indexOfClockToWatch, this preset default will not be updated until module is reloaded.
							},
						},
					],
				},
			],
			feedbacks: [],
		}
		presets['clock_stop'] = {
			type: 'button',

			category: 'Countdown Clocks',
			name: 'This button will STOP a clock selected by index (0-based). If you change the index, and still want to display the current time on the button, make sure to also update the index of the clock to watch in this modules config to match.',
			style: {
				text: 'Stop\\nClock ' + this.config.indexOfClockToWatch + '\\n$(propresenter:watched_clock_current_time)',
				size: '14',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(204, 0, 0),
			},
			steps: [
				{
					down: [
						{
							actionId: 'clockStop',
							options: {
								clockIndex: this.config.indexOfClockToWatch, // N.B. If user updates indexOfClockToWatch, this preset default will not be updated until module is reloaded.
							},
						},
					],
				},
			],
			feedbacks: [],
		}
		;(presets['clock_reset'] = {
			type: 'button',
			category: 'Countdown Clocks',
			name: 'This button will RESET a clock selected by index (0-based). If you change the index, and still want to display the current time on the button, make sure to also update the index of the clock to watch in this modules config to match.',
			style: {
				text: 'Reset\\nClock ' + this.config.indexOfClockToWatch + '\\n$(propresenter:watched_clock_current_time)',
				size: '14',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(255, 102, 0),
			},
			steps: [
				{
					down: [
						{
							actionId: 'clockReset',
							options: {
								clockIndex: this.config.indexOfClockToWatch, // N.B. If user updates indexOfClockToWatch, this preset default will not be updated until module is reloaded.
							},
						},
					],
				},
			],
			feedbacks: [],
		}),
			this.setPresetDefinitions(presets)
	}

	/**
	 * Initialize an empty current state.
	 */
	emptyCurrentState() {
		this.log('debug', 'emptyCurrentState')

		// Reinitialize the currentState variable, otherwise this variable (and the module's
		// state) will be shared between multiple instances of this module.
		this.currentState = {}

		// The internal state of the connection to ProPresenter
		this.currentState.internal = {
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
			current_pro7_look_id: null,
			awaitingSlideByLabelRequest: {}, // When user triggers action to find slide by label and trigger it, this module must first get and search the playlist.  So the request is stored here until response for playlistRequestAll is received and thee action can then be completed using the returned playlist data.
			matchingPlaylistItemFound: false, // Flag used accross recursive calls to recursivelyScanPlaylistsObjToTriggerSlideByLabel()
			awaitingGroupSlideRequest: {}, // When user triggers a new GroupSlide request, this module must first get the presentation and then search for the group slide. So the request is stored here until response for presentationRequest is received and the action can then be completed using hte returned presentation data.
			timeOfLastClockUpdate: 0, // Keep track since last 'clockCurrentTimes' message was received - there should be one every second.
			timeOfLastConnection: 0, // Keep track of last connection time
		}

		// The dynamic variable exposed to Companion
		this.currentState.dynamicVariables = {
			current_slide: 'N/A',
			current_presentation_path: 'N/A',
			current_announcement_slide: 'N/A',
			current_announcement_presentation_path: 'N/A',
			remaining_slides: 'N/A',
			total_slides: 'N/A',
			presentation_name: 'N/A',
			connection_status: 'Disconnected',
			sd_connection_status: 'Disconnected',
			follower_connection_status: 'Disconnected',
			video_countdown_timer: 'N/A',
			video_countdown_timer_hourless: 'N/A',
			video_countdown_timer_totalseconds: 'N/A',
			watched_clock_current_time: 'N/A',
			current_stage_display_name: 'N/A',
			current_stage_display_index: 'N/A',
			current_pro7_stage_layout_name: 'N/A',
			current_pro7_look_name: 'N/A',
			current_random_number: Math.floor(Math.random() * 10) + 1,
			time_since_last_clock_update: 'N/A',
			connection_timer: '0',
		}

		this.currentState.dynamicVariablesDefs = [
			{
				name: 'Current Slide number',
				variableId: 'current_slide',
			},
			{
				name: 'Current Presentation Path',
				variableId: 'current_presentation_path',
			},
			{
				name: 'Remaining Slides',
				variableId: 'remaining_slides',
			},
			{
				name: 'Total slides in presentation',
				variableId: 'total_slides',
			},
			{
				name: 'Current Announcement slide number',
				variableId: 'current_announcement_slide',
			},
			{
				name: 'Current Announcement Presentation Path',
				variableId: 'current_announcement_presentation_path',
			},
			{
				name: 'Presentation name',
				variableId: 'presentation_name',
			},
			{
				name: 'Connection status',
				variableId: 'connection_status',
			},
			{
				name: 'Watched Clock, Current Time',
				variableId: 'watched_clock_current_time',
			},
			{
				name: 'Current Stage Display Index',
				variableId: 'current_stage_display_index',
			},
			{
				name: 'Current Pro7 Stage Layout Name',
				variableId: 'current_pro7_stage_layout_name',
			},
			{
				name: 'Current Pro7 Look Name',
				variableId: 'current_pro7_look_name',
			},
			{
				name: 'Current Stage Display Name',
				variableId: 'current_stage_display_name',
			},
			{
				name: 'Video Countdown Timer',
				variableId: 'video_countdown_timer',
			},
			{
				name: 'Video Countdown Timer Hourless',
				variableId: 'video_countdown_timer_hourless',
			},
			{
				name: 'Video Countdown Timer Total Seconds',
				variableId: 'video_countdown_timer_totalseconds',
			},
			{
				name: 'Follower Connection Status',
				variableId: 'follower_connection_status',
			},
			{
				name: 'Current Random Number',
				variableId: 'current_random_number',
			},
			{
				name: 'Time Since Last Clock-Update',
				variableId: 'time_since_last_clock_update', // Allows user to monitor "health" of the websocket connection (since we expect timer updates every second, if we track time since last timer update, we can infer when "normal" communication has failed.)
			},
			{
				name: 'Connection Timer',
				variableId: 'connection_timer',
			},
		]
	}

	/**
	 * Initialize the available variables. (These are listed in the module config UI)
	 */
	initVariables() {
		// Initialize the current state and update Companion with the variables.
		this.emptyCurrentState()
		this.setVariableDefinitions(this.currentState.dynamicVariablesDefs) // Make sure to call this after this.emptyCurrentState() as it intializes this.currentState.dynamicVariablesDefs
		this.setVariableValues(this.currentState.dynamicVariables)
	}

	/**
	 * Updates the dynamic variable and records the internal state of that variable.
	 *
	 * Will log a warning if the variable doesn't exist.
	 */
	updateVariable(name, value) {
		if (!name.includes('_clock_') && !name.includes('time_since_last_clock_update') && !name.includes('_timer')) {
			// Avoid flooding log with timer updates by filtering out variables that update every second
			this.log('debug', 'updateVariable: ' + name + ' to ' + value)
		}

		if (this.currentState.dynamicVariables[name] === undefined) {
			this.log('warn', 'Variable ' + name + ' does not exist')
			return
		}

		this.currentState.dynamicVariables[name] = value

		this.setVariableValues({ [name]: value })

		if (name === 'connection_status') {
			this.checkFeedbacks('propresenter_module_connected')
		}
	}

	startWatchDogTimer() {
		this.log('debug', 'Starting Watch Dog Timer')

		// Create watchdog timer to perform various checks/updates once per second.
		this.watchDogTimer = setInterval(() => {
			if (this.config.looksPolling == 'enabled' && this.socket.readyState == 1 /*OPEN*/) {
				// only send when option is enabled AND socket is OPEN
				try {
					this.socket.send('{"action": "looksRequest"}')
				} catch (e) {
					this.log('debug', 'NETWORK ' + e)
					this.updateStatus(InstanceStatus.UnknownError, e.message)
				}
			}

			if (this.config.timerPolling == 'enabled' && this.socket.readyState == 1 /*OPEN*/) {
				// only send when option is enabled AND socket is OPEN
				try {
					this.socket.send('{"action": "clockRequest"}')
				} catch (e) {
					this.log('debug', 'NETWORK ' + e)
					this.updateStatus(InstanceStatus.UnknownError, e.message)
				}
			}

			// Keep track of how long since last clock update was received.
			if (this.currentState.internal.timeOfLastClockUpdate > 0) {
				this.updateVariable(
					'time_since_last_clock_update',
					Date.now() - this.currentState.internal.timeOfLastClockUpdate
				)
			}

			// Keep track for how long since last connected.
			if (this.currentState.internal.timeOfLastConnection > 0) {
				this.updateVariable(
					'connection_timer',
					Math.floor((Date.now() - this.currentState.internal.timeOfLastConnection) / 1000)
				)
			}
		}, 1000)
	}

	/**
	 * Create a timer to connect to ProPresenter.
	 */
	startConnectionTimer() {
		// Stop the timer if it was already running
		this.stopConnectionTimer()

		// Create a reconnect timer to watch the socket. If disconnected try to connect.
		this.log('info', 'Starting ConnectionTimer')
		this.reconTimer = setInterval(() => {
			if (this.socket === undefined || this.socket.readyState === 3 /*CLOSED*/) {
				// Not connected. Try to connect again.
				this.connectToProPresenter()
			} else {
				this.currentState.internal.wsConnected = true
			}
		}, 3000)
	}

	/**
	 * Stops the reconnection timer.
	 */
	stopConnectionTimer() {
		this.log('debug', 'Stopping ConnectionTimer')
		if (this.reconTimer !== undefined) {
			clearInterval(this.reconTimer)
			delete this.reconTimer
		}
	}

	/**
	 * Stops the Watch Dog Timer.
	 */
	stopWatchDogTimer() {
		this.log('debug', 'Stopping watchDogTimer')
		if (this.watchDogTimer !== undefined) {
			clearInterval(this.watchDogTimer)
			delete this.watchDogTimer
		}
	}

	/**
	 * Create a timer to connect to ProPresenter stage display.
	 */
	startSDConnectionTimer() {
		// Stop the timer if it was already running
		this.stopSDConnectionTimer()

		// Create a reconnect timer to watch the socket. If disconnected try to connect
		this.log('debug', 'Starting SDConnectionTimer')
		this.reconSDTimer = setInterval(() => {
			if (this.sdsocket === undefined || this.sdsocket.readyState === 3 /*CLOSED*/) {
				// Not connected. Try to connect again.
				this.connectToProPresenterSD()
			} else {
				this.currentState.internal.wsSDConnected = true
			}
		}, 5000)
	}

	/**
	 * Stops the stage display reconnection timer.
	 */
	stopSDConnectionTimer() {
		this.log('debug', 'Stopping SDConnectionTimer')
		if (this.reconSDTimer !== undefined) {
			clearInterval(this.reconSDTimer)
			delete this.reconSDTimer
		}
	}

	/**
	 * Create a timer to connect to Follower ProPresenter.
	 */
	startFollowerConnectionTimer() {
		// Stop the timer if it was already running
		this.stopFollowerConnectionTimer()

		this.log('debug', 'Starting Follower ConnectionTimer')
		// Create a reconnect timer to watch the socket. If disconnected try to connect.
		this.reconFollowerTimer = setInterval(() => {
			if (
				this.followersocket === undefined ||
				this.followersocket.readyState === 3 /*CLOSED*/ ||
				this.followersocket.readyState === 2 /*CLOSING*/
			) {
				// Not connected.
				this.currentState.internal.wsFollowerConnected = false
				// Try to connect again.
				this.connectToFollowerProPresenter()
			} else {
				if (this.followersocket.readyState === 1 /*OPEN*/) {
					this.currentState.internal.wsFollowerConnected = true
				}
			}
		}, 3000)
	}

	/**
	 * Stops the follower reconnection timer.
	 */
	stopFollowerConnectionTimer() {
		this.log('debug', 'Stopping Follower ConnectionTimer')
		if (this.reconFollowerTimer !== undefined) {
			clearInterval(this.reconFollowerTimer)
			delete this.reconFollowerTimer
		}
	}

	/**
	 * Updates the connection status variable.
	 */
	setConnectionVariable(status, updateLog) {
		this.updateVariable('connection_status', status)

		if (updateLog) {
			this.log('info', 'ProPresenter ' + status)
		}
	}

	/**
	 * Updates the stage display connection status variable.
	 */
	setSDConnectionVariable(status, updateLog) {
		this.updateVariable('sd_connection_status', status)

		if (updateLog) {
			this.log('info', 'ProPresenter Stage Display ' + status)
		}
	}

	/**
	 * Disconnect the websocket from ProPresenter, if connected.
	 */
	disconnectFromProPresenter() {
		if (this.socket !== undefined) {
			// Disconnect if already connected
			if (this.socket.readyState !== 3 /*CLOSED*/) {
				this.socket.terminate()
			}
			delete this.socket
		}
		this.currentState.internal.wsConnected = false
		this.setConnectionVariable('Disconnected', true)
	}

	/**
	 * Disconnect the websocket from ProPresenter stage display, if connected.
	 */
	disconnectFromProPresenterSD() {
		if (this.sdsocket !== undefined) {
			// Disconnect if already connected
			if (this.sdsocket.readyState !== 3 /*CLOSED*/) {
				this.sdsocket.terminate()
			}
			delete this.sdsocket
		}
	}

	/**
	 * Disconnect the websocket from Follower ProPresenter, if connected.
	 */
	disconnectFromFollowerProPresenter() {
		if (this.followersocket !== undefined) {
			// Disconnect if already connected
			if (this.followersocket.readyState !== 3 /*CLOSED*/) {
				this.followersocket.terminate()
			}
			delete this.followersocket
		}

		this.checkFeedbacks('propresenter_follower_connected')
	}

	/**
	 * Attempts to open a websocket connection with ProPresenter.
	 */
	connectToProPresenter() {
		// Check for undefined host or port. Also make sure port is [1-65535] and host is least 1 char long.
		if (
			!this.config.host ||
			this.config.host.length < 1 ||
			!this.config.port ||
			this.config.port < 1 ||
			this.config.port > 65535
		) {
			// Do not try to connect with invalid host or port
			return
		}

		// Disconnect if already connected
		this.disconnectFromProPresenter()

		this.log('debug', 'OPENING: ' + this.config.host + ':' + this.config.port)
		// Connect to remote control websocket of ProPresenter
		this.socket = new WebSocket('ws://' + this.config.host + ':' + this.config.port + '/remote')

		this.socket.on('open', () => {
			this.log('info', 'Opened websocket to ProPresenter remote control: ' + this.config.host + ':' + this.config.port)
			this.currentState.internal.timeOfLastConnection = Date.now()
			this.updateVariable('connection_timer', 0)
			this.socket.send(
				JSON.stringify({
					password: this.config.pass,
					protocol: this.config.clientVersion ? this.config.clientVersion : '701', // This will connect to Pro6 and Pro7 (the version check is happy with higher versions - but versions too low will be refused)
					action: 'authenticate',
				})
			)
		})

		this.socket.on('error', (err) => {
			this.log('debug', 'Socket error: ' + err.message)
			this.updateStatus(InstanceStatus.UnknownError, err.message)
		})

		this.socket.on('connect', () => {
			this.log('debug', 'Connected to ProPresenter remote control')
		})

		this.socket.on('close', (code, reason) => {
			// Event is also triggered when a reconnect attempt fails.
			// Reset the current state then abort; don't flood logs with disconnected notices.
			var wasConnected = this.currentState.internal.wsConnected

			this.log('debug', 'socket closed')

			if (wasConnected === false) {
				return
			}

			this.emptyCurrentState() // This is also sets this.currentState.internal.wsConnected to false

			this.updateStatus(InstanceStatus.UnknownError, 'Not connected to ProPresenter')
			this.setConnectionVariable('Disconnected', true)
		})

		this.socket.on('message', (message) => {
			// Handle the message received from ProPresenter
			this.onWebSocketMessage(message)
		})
	}

	/**
	 * Attempts to open a websocket connection with ProPresenter stage display.
	 */
	connectToProPresenterSD() {
		// Check for undefined host or port. Also make sure port is [1-65535] and host is least 1 char long.
		if (
			!this.config.host ||
			this.config.host.length < 1 ||
			!this.config.port ||
			this.config.port < 1 ||
			this.config.port > 65535
		) {
			// Do not try to connect with invalid host or port
			return
		}

		// Disconnect if already connected
		this.disconnectFromProPresenterSD()

		if (this.config.host === undefined) {
			return
		}

		// Check for undefined sdport. Also make sure sdport is [1-65535]. (Otherwise, use ProPresenter remote port)
		if (!this.config.sdport || this.config.sdport < 1 || this.config.sdport > 65535) {
			this.config.sdport = this.config.port
		}

		// Connect to Stage Display websocket of ProPresenter
		this.sdsocket = new WebSocket('ws://' + this.config.host + ':' + this.config.sdport + '/stagedisplay')

		this.sdsocket.on('open', () => {
			this.log('info', 'Opened websocket to ProPresenter stage display: ' + this.config.host + ':' + this.config.sdport)
			this.sdsocket.send(
				JSON.stringify({
					pwd: this.config.sdpass,
					ptl: 610, //Pro7 still wants 610 ! (so this works for both Pro6 and Pro7)
					acn: 'ath',
				})
			)
		})

		// Since Stage Display connection is not required to function - we will only send a warning if it fails
		this.sdsocket.on('error', (err) => {
			// If stage display can't connect - it's not really a "code red" error - since *most* of the core functionally does not require it.
			// Therefore, a failure to connect stage display is more of a warning state.
			// However, if the module is already in error, then we should not lower that to warning!
			if (this.currentStatus !== InstanceStatus.UnknownError && this.config.use_sd === 'yes') {
				this.updateStatus(InstanceStatus.UnknownWarning, 'OK - Stage Display not connected')
			}
			this.log('debug', 'SD socket error: ' + err.message)
		})

		this.sdsocket.on('connect', () => {
			this.log('debug', 'Connected to ProPresenter stage display')
		})

		this.sdsocket.on('close', (code, reason) => {
			// Event is also triggered when a reconnect attempt fails.
			// Reset the current state then return from this function and avoid flooding logs with disconnected notices.
			if (this.currentState.internal.wsSDConnected === false) {
				return
			}
			this.currentState.internal.wsSDConnected = false // Just set this var instead of emptyCurrentState (this is all SD connection is used for)

			if (this.config.use_sd === 'yes' && this.socket !== undefined && this.socket.readyState === 1 /* OPEN */) {
				this.updateStatus(InstanceStatus.UnknownWarning, 'OK, But Stage Display closed')
			}
			this.log('debug', 'SD Disconnected')
			this.setSDConnectionVariable('Disconnected', true)
		})

		this.sdsocket.on('message', (message) => {
			// Handle the stage display message received from ProPresenter
			this.onSDWebSocketMessage(message)
		})
	}

	/**
	 * Attempts to open a websocket connection with Follower ProPresenter.
	 */
	connectToFollowerProPresenter() {
		// Check for undefined host or port. Also make sure port is [1-65535] and host is least 1 char long.
		if (
			!this.config.followerhost ||
			this.config.followerhost.length < 1 ||
			!this.config.followerport ||
			this.config.followerport < 1 ||
			this.config.followerport > 65535
		) {
			// Do not try to connect with invalid host or port
			return
		}

		// Disconnect if already connected
		this.disconnectFromFollowerProPresenter()

		// Connect to remote control websocket of ProPresenter
		this.followersocket = new WebSocket('ws://' + this.config.followerhost + ':' + this.config.followerport + '/remote')

		this.followersocket.on('open', () => {
			this.log(
				'info',
				'Opened websocket to Follower ProPresenter remote control: ' +
					this.config.followerhost +
					':' +
					this.config.followerport
			)
			this.followersocket.send(
				JSON.stringify({
					password: this.config.followerpass,
					protocol: this.config.clientVersion ? this.config.clientVersion : '701', // This will connect to Pro6 and Pro7 (the version check is happy with higher versions)
					action: 'authenticate',
				})
			)
		})

		this.followersocket.on('error', (err) => {
			if (this.config.control_follower === 'yes') {
				this.log('warn', 'Follower Socket error: ' + err.message)
			}
			this.currentState.internal.wsFollowerConnected = false
		})

		this.followersocket.on('close', (code, reason) => {
			// Event is also triggered when a reconnect attempt fails.
			// Reset the current state then abort; don't flood logs with disconnected notices.
			var wasFollowerConnected = this.currentState.internal.wsFollowerConnected
			this.currentState.internal.wsFollowerConnected = false

			if (wasFollowerConnected === false) {
				return
			}
			this.log('info', 'Follower ProPresenter socket connection closed')
		})

		this.followersocket.on('message', (message) => {
			// Handle the message received from ProPresenter
			this.onFollowerWebSocketMessage(message)
		})
	}

	init_feedbacks = () => {
		var feedbacks = {}
		feedbacks['stagedisplay_active'] = {
			label: 'Change colors based on active stage display',
			description: 'If the specified stage display is active, change colors of the bank',
			options: [
				{
					type: 'colorpicker',
					label: 'Foreground color',
					id: 'fg',
					default: combineRgb(255, 255, 255),
				},
				{
					type: 'colorpicker',
					label: 'Background color',
					id: 'bg',
					default: combineRgb(0, 153, 51),
				},
				{
					type: 'textinput',
					label: 'Stage Display Index',
					id: 'index',
					default: 0,
					regex: this.REGEX_NUMBER,
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
					default: combineRgb(255, 255, 255),
				},
				{
					type: 'colorpicker',
					label: 'Background color',
					id: 'bg',
					default: combineRgb(0, 153, 51),
				},
				{
					type: 'dropdown',
					label: 'Pro7 Stage Display Screen',
					id: 'pro7StageScreenUUID',
					tooltip: 'Choose which stage display screen you want to monitor',
					choices: this.currentState.internal.pro7StageScreens,
				},
				{
					type: 'dropdown',
					label: 'Pro7 Stage Display Layout',
					id: 'pro7StageLayoutUUID',
					tooltip: 'Choose the stage display layout to trigger above color change',
					choices: this.currentState.internal.pro7StageLayouts,
				},
			],
		}

		feedbacks['active_look'] = {
			label: 'Change colors based on active look',
			description: 'If the specified look display is active, change colors of the bank',
			options: [
				{
					type: 'colorpicker',
					label: 'Foreground color',
					id: 'fg',
					default: combineRgb(255, 255, 255),
				},
				{
					type: 'colorpicker',
					label: 'Background color',
					id: 'bg',
					default: combineRgb(0, 153, 51),
				},
				{
					type: 'dropdown',
					label: 'Look',
					id: 'look',
					tooltip: 'Choose the Look to trigger above color change',
					choices: this.currentState.internal.pro7Looks,
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
					default: combineRgb(255, 255, 255),
				},
				{
					type: 'colorpicker',
					label: 'Connected Background color',
					id: 'cbg',
					default: combineRgb(0, 153, 51),
				},
				{
					type: 'colorpicker',
					label: 'Disconnected Foreground color',
					id: 'dfg',
					default: combineRgb(255, 255, 255),
				},
				{
					type: 'colorpicker',
					label: 'Disconnected Background color',
					id: 'dbg',
					default: combineRgb(204, 0, 0),
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
					default: combineRgb(255, 255, 255),
				},
				{
					type: 'colorpicker',
					label: 'Connected & Controlled Background color',
					id: 'fcbg',
					default: combineRgb(0, 153, 51),
				},
				{
					type: 'colorpicker',
					label: 'Connected & Control Disabled Foreground color',
					id: 'fcdfg',
					default: combineRgb(255, 255, 255),
				},
				{
					type: 'colorpicker',
					label: 'Connected & Control Disabled Background color',
					id: 'fcdbg',
					default: combineRgb(255, 102, 10),
				},
				{
					type: 'colorpicker',
					label: 'Disconnected Foreground color',
					id: 'fdfg',
					default: combineRgb(255, 255, 255),
				},
				{
					type: 'colorpicker',
					label: 'Disconnected Background color',
					id: 'fdbg',
					default: combineRgb(204, 0, 0),
				},
			],
		}

		this.setFeedbackDefinitions(feedbacks)
	}

	feedback = (feedback, bank) => {
		this.log('debug', 'feedback type: ' + feedback.type)

		if (feedback.type == 'stagedisplay_active') {
			if (this.currentState.internal.stageDisplayIndex == feedback.options.index) {
				return { color: feedback.options.fg, bgcolor: feedback.options.bg }
			}
		}

		if (feedback.type == 'propresenter_module_connected') {
			if (this.currentState.internal.wsConnected) {
				return { color: feedback.options.cfg, bgcolor: feedback.options.cbg }
			} else {
				return { color: feedback.options.dfg, bgcolor: feedback.options.dbg }
			}
		}

		if (feedback.type == 'propresenter_follower_connected') {
			if (this.currentState.internal.wsFollowerConnected) {
				if (this.config.control_follower === 'yes') {
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
			var stageScreen = this.currentState.internal.pro7StageScreens.find(
				(pro7StageScreen) =>
					pro7StageScreen.id ===
					(feedback.options.pro7StageScreenUUID
						? feedback.options.pro7StageScreenUUID
						: this.currentState.internal.pro7StageScreens[0].id)
			)

			this.log('debug', 'feedback for ' + feedback.options.pro7StageScreenUUID)

			// Exit if we could not find matching screen
			if (stageScreen === undefined) {
				return
			}

			// Check stage layout for screeen and return feedback color if matched
			if (
				stageScreen.layoutUUID ===
				(feedback.options.pro7StageLayoutUUID
					? feedback.options.pro7StageLayoutUUID
					: this.currentState.internal.pro7StageLayouts[0].id)
			) {
				return { color: feedback.options.fg, bgcolor: feedback.options.bg }
			}
		}

		if (feedback.type == 'active_look') {
			if (this.currentState.internal.current_pro7_look_id == feedback.options.look) {
				return { color: feedback.options.fg, bgcolor: feedback.options.bg }
			}
		}
	}

	/**
	 * Received a message from ProPresenter.
	 */
	onWebSocketMessage = (message) => {
		var objData

		// Try to parse websocket payload as JSON...
		try {
			objData = JSON.parse(message)
		} catch (err) {
			this.log('warn', err.message)
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
							this.currentState.internal.proMajorVersion = 7
						}
					} else {
						// Leave default
					}

					this.log(
						'info',
						'Authenticated to ProPresenter (Version: ' + this.currentState.internal.proMajorVersion + ')'
					)
					this.updateStatus(InstanceStatus.Ok)
					this.currentState.internal.wsConnected = true
					// Successfully authenticated. Request current state.
					this.setConnectionVariable('Connected', true)
					this.getProPresenterState(true) // Force refresh with 'presentationCurrent' after first connection is authenticated (to ensure we alway have presentationPath)
					this.init_feedbacks()
					// Get current Stage Display (index and Name)
					this.getStageDisplaysInfo()
					// Get current Pro7 Macros & Looks List.
					if (this.currentState.internal.proMajorVersion >= 7) {
						this.getMacrosList()
						this.getLooksList()
					}

					// Ask ProPresenter to start sending clock updates (they are sent once per second)
					this.socket.send(
						JSON.stringify({
							action: 'clockStartSendingCurrentTime',
						})
					)
				} else {
					this.updateStatus(InstanceStatus.UnknownError)
					// Bad password
					this.log('warn', 'Failed to authenticate to ProPresenter. ' + objData.error)
					this.disconnectFromProPresenter()

					// No point in trying to connect again. The user must either re-enable this
					//	module or re-save the config changes to make another attempt.
					this.stopConnectionTimer()
				}
				break

			case 'presentationTriggerIndex':
				this.updateVariable('current_presentation_path', String(objData.presentationPath)) // this is included in presentationTriggerIndex - but not presentationTriggerIndex
			// Do not break - processing there two mesages is basically the same (except presentationPath)
			case 'presentationSlideIndex':
				// Update the current slide index.
				var slideIndex = parseInt(objData.slideIndex, 10)

				if (objData.hasOwnProperty('presentationDestination') && objData.presentationDestination == 1) {
					// Track Announcement layer presentationPath and Slide Index
					this.updateVariable('current_announcement_slide', slideIndex + 1)
					this.updateVariable('current_announcement_presentation_path', String(objData.presentationPath))
				} else {
					// Track Presentation layer presentationPath, Slide Index )and optionally remaining slides)
					this.currentState.internal.slideIndex = slideIndex
					this.updateVariable('current_slide', slideIndex + 1)
					if (objData.presentationPath == this.currentState.internal.presentationPath) {
						// If the triggered slide is part of the current presentation (for which we have stored the total slides) then update the 'remaining_slides' dynamic variable
						// Note that, if the triggered slide is NOT part of the current presentation, the 'remaining_slides' dynamic variable will be updated later when we call the presentationCurrent action to refresh current presentation info.
						this.updateVariable('remaining_slides', this.currentState.dynamicVariables['total_slides'] - slideIndex - 1)
					}
				}

				// Workaround for bug that occurs when a presentation with automatically triggered slides (eg go-to-next timer), fires one of it's slides while *another* presentation is selected and before any slides within the newly selected presentation are fired. This will lead to total_slides being wrong (and staying wrong) even after the user fires slides within the newly selected presentation.
				setTimeout(() => {
					this.getProPresenterState()
				}, 400)
				this.log(
					'info',
					'Slide Triggered: ' +
						String(objData.presentationPath) +
						'.' +
						String(objData.slideIndex) +
						' on layerid: ' +
						String(objData.presentationDestination)
				)

				// Trigger same slide in follower ProPresenter (If configured and connected)
				if (this.config.control_follower === 'yes' && this.currentState.internal.wsFollowerConnected) {
					cmd = {
						action: 'presentationTriggerIndex',
						slideIndex: String(slideIndex),
						// Pro 6 for Windows requires 'presentationPath' to be set.
						presentationPath: objData.presentationPath,
					}
					this.log('debug', 'Forwarding command to Follower: ' + JSON.stringify(cmd))
					try {
						var cmdJSON = JSON.stringify(cmd)
						this.followersocket.send(cmdJSON)
					} catch (e) {
						this.log('debug', 'Follower NETWORK ' + e)
					}
				}

				break

			case 'clearText':
				// Forward command to follower (Only if clearText is recieved twice less than 300msec apart - Since Pro7.4.1 on Windows sends clearText for every slide and send it twice for real clearText action)
				var timeOfThisClearMessage = new Date()
				if (
					this.config.control_follower === 'yes' &&
					this.currentState.internal.wsFollowerConnected &&
					this.currentState.internal.previousTimeOfLeaderClearMessage != null &&
					timeOfThisClearMessage.getTime() - this.currentState.internal.previousTimeOfLeaderClearMessage.getTime() < 300
				) {
					cmd = {
						action: 'clearText',
					}
					this.log('debug', 'Forwarding command to Follower: ' + JSON.stringify(cmd))
					try {
						var cmdJSON = JSON.stringify(cmd)
						this.followersocket.send(cmdJSON)
					} catch (e) {
						this.log('debug', 'Follower NETWORK ' + e)
					}
				}
				this.currentState.internal.previousTimeOfLeaderClearMessage = timeOfThisClearMessage
				break

			case 'clearAll':
				// Forward command to follower
				if (this.config.control_follower === 'yes' && this.currentState.internal.wsFollowerConnected) {
					cmd = {
						action: 'clearAll',
					}
					this.log('debug', 'Forwarding command to Follower: ' + JSON.stringify(cmd))
					try {
						var cmdJSON = JSON.stringify(cmd)
						this.followersocket.send(cmdJSON)
					} catch (e) {
						this.log('debug', 'Follower NETWORK ' + e)
					}
				}
				break

			case 'clearVideo':
				// Forward command to follower
				if (this.config.control_follower === 'yes' && this.currentState.internal.wsFollowerConnected) {
					cmd = {
						action: 'clearVideo',
					}
					this.log('debug', 'Forwarding command to Follower: ' + JSON.stringify(cmd))
					try {
						var cmdJSON = JSON.stringify(cmd)
						this.followersocket.send(cmdJSON)
					} catch (e) {
						this.log('debug', 'Follower NETWORK ' + e)
					}
				}
				break

			case 'clearAudio':
				// Forward command to follower
				if (this.config.control_follower === 'yes' && this.currentState.internal.wsFollowerConnected) {
					cmd = {
						action: 'clearAudio',
					}
					this.log('debug', 'Forwarding command to Follower: ' + JSON.stringify(cmd))
					try {
						var cmdJSON = JSON.stringify(cmd)
						this.followersocket.send(cmdJSON)
					} catch (e) {
						this.log('debug', 'Follower NETWORK ' + e)
					}
				}
				break

			case 'presentationCurrent':
				var objPresentation = objData.presentation

				// Check for awaiting SlideByLabel request
				// If found, we need to interate over the groups/slides nested array (linearly in order) - counting slides until it finds a match...
				// ...then we will have slideIndex to use in the {"action":"presentationTriggerIndex","slideIndex":[SLIDE INDEX],"presentationPath":"[PRESENTATION PATH]"}
				if (
					this.currentState.internal.awaitingSlideByLabelRequest.hasOwnProperty('presentationPath') &&
					this.currentState.internal.awaitingSlideByLabelRequest.presentationPath == objData.presentationPath
				) {
					this.log(
						'debug',
						'Found matching awaitingSlideByLabelRequest: ' +
							JSON.stringify(this.currentState.internal.awaitingSlideByLabelRequest)
					)
					var slideIndex = 0
					var foundSlide = false
					for (
						var presentationSlideGroupsIndex = 0;
						presentationSlideGroupsIndex < objPresentation.presentationSlideGroups.length;
						presentationSlideGroupsIndex++
					) {
						for (
							var groupSlidesIndex = 0;
							groupSlidesIndex <
							objPresentation.presentationSlideGroups[presentationSlideGroupsIndex].groupSlides.length;
							groupSlidesIndex++
						) {
							if (
								objPresentation.presentationSlideGroups[presentationSlideGroupsIndex].groupSlides[groupSlidesIndex]
									.slideLabel == this.currentState.internal.awaitingSlideByLabelRequest.slideLabel
							) {
								this.log(
									'debug',
									'Labels match: ' +
										objPresentation.presentationSlideGroups[presentationSlideGroupsIndex].groupSlides[groupSlidesIndex]
											.slideLabel +
										'=' +
										this.currentState.internal.awaitingSlideByLabelRequest.slideLabel +
										' at index: ' +
										slideIndex
								)
								foundSlide = true
							}
							if (foundSlide) {
								break
							} else {
								slideIndex++
							}
						}
						if (foundSlide) {
							break
						}
					}
					if (foundSlide) {
						// we have finally found the slide, within it's presentation & playlist - send presentationTriggerIndex to trigger it
						cmd = {
							action: 'presentationTriggerIndex',
							slideIndex: String(slideIndex),
							presentationPath: this.currentState.internal.awaitingSlideByLabelRequest.presentationPath,
						}
						this.log('debug', 'cmd=' + JSON.stringify(cmd))
						try {
							if (this.socket.readyState == 1 /*OPEN*/) {
								this.socket.send(JSON.stringify(cmd))
							}
						} catch (e) {
							this.log('debug', 'Socket Send Error: ' + e.message)
						}
					} else {
						this.log(
							'debug',
							'Could not find slide with label: ' + this.currentState.internal.awaitingSlideByLabelRequest.slideLabel
						)
					}
					this.currentState.internal.awaitingSlideByLabelRequest = {} // All done, reset awaitingSlideByLabelRequest
				}

				// Check for awaiting GroupSlide request
				// If found, we need to interate over the groups/slides nested array (linearly in order) - to find specified slide in specified group
				// ...then we will have slideIndex to use in the {"action":"presentationTriggerIndex","slideIndex":[SLIDE INDEX],"presentationPath":"[PRESENTATION PATH]"}
				if (
					this.currentState.internal.awaitingGroupSlideRequest.hasOwnProperty('presentationPath') &&
					this.currentState.internal.awaitingGroupSlideRequest.presentationPath == objData.presentationPath
				) {
					this.log(
						'debug',
						'Found matching awaitingGroupSlideRequest: ' +
							JSON.stringify(this.currentState.internal.awaitingGroupSlideRequest)
					)

					var groupNames = this.currentState.internal.awaitingGroupSlideRequest.groupName.split('|') // Search each group given (separated by |)
					for (var groupNameIndex = 0; groupNameIndex < groupNames.length; groupNameIndex++) {
						var slideIndex = 0
						var foundSlide = false
						for (
							var presentationSlideGroupsIndex = 0;
							presentationSlideGroupsIndex < objPresentation.presentationSlideGroups.length;
							presentationSlideGroupsIndex++
						) {
							for (
								var groupSlidesIndex = 0;
								groupSlidesIndex <
								objPresentation.presentationSlideGroups[presentationSlideGroupsIndex].groupSlides.length;
								groupSlidesIndex++
							) {
								if (
									objPresentation.presentationSlideGroups[presentationSlideGroupsIndex].groupName ==
										groupNames[groupNameIndex] &&
									groupSlidesIndex == this.currentState.internal.awaitingGroupSlideRequest.slideNumber - 1
								) {
									this.log(
										'debug',
										'Found Group Slide: ' +
											objPresentation.presentationSlideGroups[presentationSlideGroupsIndex].groupName +
											'=' +
											groupNames[groupNameIndex] +
											' at index: ' +
											slideIndex
									)
									foundSlide = true
								}
								if (foundSlide) {
									break
								} else {
									slideIndex++
								}
							}
							if (foundSlide) {
								break
							}
						}
						if (foundSlide) {
							break
						}
					}

					if (foundSlide) {
						// we have finally found the slide, within it's presentation & playlist - send presentationTriggerIndex to trigger it
						cmd = {
							action: 'presentationTriggerIndex',
							slideIndex: String(slideIndex),
							presentationPath: this.currentState.internal.awaitingGroupSlideRequest.presentationPath,
						}
						this.log('debug', 'cmd=' + JSON.stringify(cmd))
						try {
							if (this.socket.readyState == 1 /*OPEN*/) {
								this.socket.send(JSON.stringify(cmd))
							}
						} catch (e) {
							this.log('debug', 'Socket Send Error: ' + e.message)
						}
					} else {
						this.log(
							'debug',
							'Could not find slide ' +
								this.currentState.internal.awaitingGroupSlideRequest.slideNumber +
								' in group(s): ' +
								this.currentState.internal.awaitingGroupSlideRequest.groupName
						)
					}
					this.currentState.internal.awaitingGroupSlideRequest = {} // All done, reset awaitingGroupSlideRequest
				}

				// If playing from the library on Mac, the presentationPath here will be the full
				//	path to the document on the user's computer ('/Users/JohnDoe/.../filename.pro6'),
				//  which differs from objData.presentationPath returned by an action like
				//  'presentationTriggerIndex' or 'presentationSlideIndex' which only contains the
				//  filename.
				// These two values need to match or we'll re-request 'presentationCurrent' on every
				//  slide change. Strip off everything before and including the final '/'.
				// TODO: revisit this logic for Pro7 (consider updating to suit Pro7 instead of Pro6)
				objData.presentationPath = objData.presentationPath.replace(/.*\//, '')

				// Remove file extension (.pro or .pro6) to make module var friendly.
				var presentationName = objPresentation.presentationName.replace(/\.pro.?$/i, '')
				this.updateVariable('presentation_name', presentationName)

				// '.presentationPath' and '.presentation.presentationCurrentLocation' look to be
				//	the same on Pro6 Mac, but '.presentation.presentationCurrentLocation' is the
				//	wrong value on Pro6 PC (tested 6.1.6.2). Use '.presentationPath' instead.
				this.currentState.internal.presentationPath = objData.presentationPath
				this.updateVariable('current_presentation_path', objData.presentationPath)

				// Get the total number of slides in this presentation
				var totalSlides = 0
				for (var i = 0; i < objPresentation.presentationSlideGroups.length; i++) {
					totalSlides += objPresentation.presentationSlideGroups[i].groupSlides.length
				}

				this.updateVariable('total_slides', totalSlides)

				// Update remaining_slides (as total_slides has probably just changed)
				this.updateVariable(
					'remaining_slides',
					this.currentState.dynamicVariables['total_slides'] - this.currentState.dynamicVariables['current_slide']
				)

				this.log('debug', 'presentationCurrent: ' + presentationName)
				break

			case 'clockRequest':
				// Using clockRequest for a workaround when clockCurrentTimes action is never recieved from some versions of Pro7 on MacOS
				// The workaround is to manually poll with clockRequests - when a clockRequest response is recieved, just pre-load objData.clockTimes with the times array from the clockRequest clockInfo and keep using the normal processing below that processes the clockTimes array!
				objData.clockTimes = objData.clockInfo.map((x) => x.clockTime)
			case 'clockCurrentTime':
			case 'clockCurrentTimes':
				var objClockTimes = objData.clockTimes

				this.currentState.internal.timeOfLastClockUpdate = Date.now() // Keep track since last 'clockCurrentTimes' message was received - there should be one every second.
				this.updateVariable('time_since_last_clock_update', 0)

				// Update dyn var for watched clock/timer
				if (this.config.indexOfClockToWatch >= 0 && this.config.indexOfClockToWatch < objData.clockTimes.length) {
					this.updateVariable('watched_clock_current_time', objData.clockTimes[this.config.indexOfClockToWatch])
				}

				// Update complete list of dyn vars for all clocks/timers (two for each clock - one with and one without hours)
				var updateModuleVars = false
				for (let clockIndex = 0; clockIndex < objClockTimes.length; clockIndex++) {
					// Update (add) dynamic clock variable
					this.currentState.dynamicVariables['pro7_clock_' + clockIndex] = this.formatClockTime(
						objClockTimes[clockIndex]
					)
					this.updateVariable(
						'pro7_clock_' + clockIndex,
						this.currentState.dynamicVariables['pro7_clock_' + clockIndex]
					)
					// If we don't already have this dynamic var defined then add a definition for it (we'll update Companion once loop is done)
					var varDef = { label: 'Pro7 Clock ' + clockIndex, name: 'pro7_clock_' + clockIndex }
					if (!this.currentState.dynamicVariablesDefs.some(({ name }) => name === varDef.name)) {
						this.currentState.dynamicVariablesDefs.push(varDef)
						updateModuleVars = true
					}

					// Update (add) dynamic clock variable (hourless)
					this.currentState.dynamicVariables['pro7_clock_' + clockIndex + '_hourless'] = this.formatClockTime(
						objClockTimes[clockIndex],
						false
					)
					this.updateVariable(
						'pro7_clock_' + clockIndex + '_hourless',
						this.currentState.dynamicVariables['pro7_clock_' + clockIndex + '_hourless']
					)
					// If we don't already have this dynamic var defined then add a definition for it (we'll update Companion once loop is done)
					var varDef = {
						label: 'Pro7 Clock ' + clockIndex + ' Hourless',
						name: 'pro7_clock_' + clockIndex + '_hourless',
					}
					if (!this.currentState.dynamicVariablesDefs.some(({ name }) => name === varDef.name)) {
						this.currentState.dynamicVariablesDefs.push(varDef)
						updateModuleVars = true
					}

					// Update (add) dynamic clock variable (totalseconds)
					this.currentState.dynamicVariables['pro7_clock_' + clockIndex + '_totalseconds'] = this.convertToTotalSeconds(
						objClockTimes[clockIndex]
					)
					this.updateVariable(
						'pro7_clock_' + clockIndex + '_totalseconds',
						this.currentState.dynamicVariables['pro7_clock_' + clockIndex + '_totalseconds']
					)
					// If we don't already have this dynamic var defined then add a definition for it (we'll update Companion once loop is done)
					var varDef = {
						label: 'Pro7 Clock ' + clockIndex + ' Total Seconds',
						name: 'pro7_clock_' + clockIndex + '_totalseconds',
					}
					if (!this.currentState.dynamicVariablesDefs.some(({ name }) => name === varDef.name)) {
						this.currentState.dynamicVariablesDefs.push(varDef)
						updateModuleVars = true
					}
				}

				// Tell Companion about any new module vars for clocks that were added (so they become visible in WebUI etc)
				if (updateModuleVars) {
					this.setVariableDefinitions(this.currentState.dynamicVariablesDefs)
				}

				break

			case 'stageDisplaySetIndex': // Companion User (or someone else) has set a new Stage Display Layout in Pro6 (Time to refresh stage display dynamic variables)
				if (this.currentState.internal.proMajorVersion === 6) {
					var stageDisplayIndex = objData.stageDisplayIndex
					this.currentState.internal.stageDisplayIndex = parseInt(stageDisplayIndex, 10)
					this.updateVariable('current_stage_display_index', stageDisplayIndex)
					this.getStageDisplaysInfo()
					this.checkFeedbacks('stagedisplay_active')
				}
				break

			case 'stageDisplaySets':
				if (this.currentState.internal.proMajorVersion === 6) {
					// ******* PRO6 *********
					// Handle Pro6 Stage Display Info...
					// The Pro6 response from sending stageDisplaySets is a reply that includes an array of stageDisplaySets, and an index "stageDisplayIndex" that is set to the index of the currently selected layout for the single stage display in Pro6
					var stageDisplaySets = objData.stageDisplaySets
					var stageDisplayIndex = objData.stageDisplayIndex
					this.currentState.internal.stageDisplayIndex = parseInt(stageDisplayIndex, 10)
					this.updateVariable('current_stage_display_index', stageDisplayIndex)
					this.updateVariable('current_stage_display_name', stageDisplaySets[parseInt(stageDisplayIndex, 10)])
					this.checkFeedbacks('stagedisplay_active')
				} else if (this.currentState.internal.proMajorVersion === 7) {
					// ******* PRO7 *********
					// Handle Pro7 Stage Display Info...
					// The Pro7 response from sending stageDisplaySets is a reply that includes TWO arrays/lists
					// The list "stageLayouts" includes the name and id of each stagelayout defined in Pro7
					// The list "stageScreens: includes name, id and id of the selected stageLayout for all stage output screens defined in Pro7
					var watchScreen_StageLayoutSelectedLayoutUUID = ''

					// Refresh list of all stageLayouts (name and id)
					if (objData.hasOwnProperty('stageLayouts')) {
						// Empty old list of stageLayouts
						this.currentState.internal.pro7StageLayouts = []

						// Refresh list from new data
						objData.stageLayouts.forEach((stageLayout) => {
							this.currentState.internal.pro7StageLayouts.push({
								id: stageLayout['stageLayoutUUID'],
								label: stageLayout['stageLayoutName'],
							})
						})
					}

					// Refresh list of stage OUTPUT SCREENS
					// Update the records of screen names (and selected layout UUID)
					// Updates dynamic module vars for stage layouts
					// Also record UUID of the current_pro7_stage_layout_name for selected watched screen
					if (objData.hasOwnProperty('stageScreens')) {
						// Empty old list of pro7StageScreens
						this.currentState.internal.pro7StageScreens = []

						// Refresh list from new data
						var updateModuleVars = false
						objData.stageScreens.forEach((stageScreen) => {
							var stageScreenName = stageScreen['stageScreenName']
							var stageScreenUUID = stageScreen['stageScreenUUID']
							var stageLayoutSelectedLayoutUUID = stageScreen['stageLayoutSelectedLayoutUUID']
							this.currentState.internal.pro7StageScreens.push({
								id: stageScreenUUID,
								label: stageScreenName,
								layoutUUID: stageLayoutSelectedLayoutUUID,
							})

							// Update dynamic module var with current layout name for this pro7 stage screen
							try {
								this.currentState.dynamicVariables[stageScreenName + '_pro7_stagelayoutname'] =
									this.currentState.internal.pro7StageLayouts.find(
										(pro7StageLayout) => pro7StageLayout.id === stageLayoutSelectedLayoutUUID
									).label
								this.updateVariable(
									stageScreenName + '_pro7_stagelayoutname',
									this.currentState.dynamicVariables[stageScreenName + '_pro7_stagelayoutname']
								)
								// If we don't already have this dynamic var defined then add a definition for it (we'll update Companion once loop is done)
								var varDef = {
									label: stageScreenName + '_pro7_stagelayoutname',
									name: stageScreenName + '_pro7_stagelayoutname',
								}
								if (!this.currentState.dynamicVariablesDefs.some(({ name }) => name === varDef.name)) {
									this.currentState.dynamicVariablesDefs.push(varDef)
									updateModuleVars = true
								}
							} catch (e) {
								this.log(
									'warn',
									'Error finding/updating layout name for ' + stageScreenName + '_pro7_stagelayoutname. ' + e.message
								)
							}

							// Capture the UUID of the current_pro7_stage_layout_name for selected watched screen
							if (stageScreenUUID === this.config.GUIDOfStageDisplayScreenToWatch) {
								watchScreen_StageLayoutSelectedLayoutUUID = stageLayoutSelectedLayoutUUID
								this.currentState.internal.stageDisplayIndex = this.currentState.internal.pro7StageLayouts
									.map((x) => {
										return x.id
									})
									.indexOf(watchScreen_StageLayoutSelectedLayoutUUID)
								this.checkFeedbacks('stagedisplay_active')
							}
						})

						// Tell Companion about any new module vars for stage screens that were added (so they become visible in WebUI etc)
						if (updateModuleVars) {
							this.setVariableDefinitions(this.currentState.dynamicVariablesDefs)
						}
					}

					// Update current_pro7_stage_layout_name
					if (objData.hasOwnProperty('stageLayouts')) {
						objData.stageLayouts.forEach((stageLayout) => {
							if (stageLayout['stageLayoutUUID'] === watchScreen_StageLayoutSelectedLayoutUUID) {
								this.updateVariable('current_pro7_stage_layout_name', stageLayout['stageLayoutName'])
							}
						})
					}

					this.checkFeedbacks('pro7_stagelayout_active')

					this.log('info', 'Got Pro7 Stage Display Sets')
					this.setActionDefinitions(GetActions(this))

					this.init_feedbacks() // Update dropdown lists for pro7 stage layout feedback.
				}
				break

			case 'looksRequest': // Response from sending looksRequest
				if (objData.hasOwnProperty('looks')) {
					var currentLooks = []
					objData.looks.forEach((look) => {
						var lookName = look['lookName']
						var lookID = look['lookID']
						currentLooks.push({ id: lookID, label: lookName })
					})

					// Update dyn var for current look name
					this.updateVariable('current_pro7_look_name', objData.activeLook.lookName)
					// Keep track of ID for current look
					this.currentState.internal.current_pro7_look_id = objData.activeLook.lookID

					this.log('debug', 'Got Pro7 Looks List, Active Look = ' + objData.activeLook.lookName)

					// Compare currentLooks with this.currentState.internal.pro7Looks If it is different then update list and UI
					var looksChanged = false
					if (this.currentState.internal.pro7Looks.length == currentLooks.length) {
						for (var index = 0; index < this.currentState.internal.pro7Looks.length; index++) {
							var internalLook = this.currentState.internal.pro7Looks[index]
							if (
								internalLook.lookName != currentLooks[index].lookName ||
								internalLook.lookID != currentLooks[index].lookID
							) {
								looksChanged = true
								break
							}
						}
					} else {
						looksChanged = true
					}

					if (looksChanged) {
						this.log('debug', 'Looks changed. Updated internal list ')
						this.currentState.internal.pro7Looks = currentLooks.slice() // Update .internal.pro7Looks to same as currentLooks
						this.setActionDefinitions(GetActions(this))
						this.init_feedbacks() // Update dropdown lists for look feedback.
					}

					this.checkFeedbacks('active_look')
				}
				break

			case 'macrosRequest': // Response from sending macrosRequest
				if (objData.hasOwnProperty('macros')) {
					this.currentState.internal.pro7Macros = []
					objData.macros.forEach((look) => {
						var macroName = look['macroName']
						var macroID = look['macroID']
						this.currentState.internal.pro7Macros.push({ id: macroID, label: macroName })
					})

					this.log('info', 'Got Pro7 Macros List')
					this.setActionDefinitions(GetActions(this))
				}
				break

			case 'playlistRequestAll':
				this.log('debug', 'Received All PlayLists')
				// Check if there is an awaiting SlideByLabelRequest...
				// ..If so, cAll recursivelyScanPlaylistsObjToTriggerSlideByLabel() to find presentation path
				//  Update this.currentState.internal.awaitingSlideByLabelRequest with the matching path and then send a presentationRequest.
				//  presentationRequest will return a presetationCurrent response, and because there is an waiting SlideByLabelRequest, the response will be searched for matching slide so the request can finally be completed.
				var awaitingSlideByLabelRequest = this.currentState.internal.awaitingSlideByLabelRequest
				if (
					awaitingSlideByLabelRequest.hasOwnProperty('playlistName') &&
					awaitingSlideByLabelRequest.hasOwnProperty('presentationName') &&
					awaitingSlideByLabelRequest.hasOwnProperty('slideLabel')
				) {
					this.log(
						'debug',
						'Scanning playlists for: [' +
							awaitingSlideByLabelRequest.playlistName +
							', ' +
							awaitingSlideByLabelRequest.presentationName +
							', ' +
							awaitingSlideByLabelRequest.slideLabel +
							']'
					)

					// Prepare for recursive search (using this.currentState.internal.matchingPlaylistItemFound as a flag between recursive calls to recursivelyScanPlaylistsObjToTriggerSlideByLabel)
					try {
						this.currentState.internal.matchingPlaylistItemFound = false
						this.recursivelyScanPlaylistsObjToTriggerSlideByLabel(
							JSON.parse(message),
							awaitingSlideByLabelRequest.playlistName,
							awaitingSlideByLabelRequest.presentationName,
							awaitingSlideByLabelRequest.slideLabel
						)
					} catch (err) {
						this.log('debug', err.message)
					}
				}
				break
		}

		if (
			objData.presentationPath !== undefined &&
			objData.presentationPath !== this.currentState.internal.presentationPath
		) {
			// The presentationPath has changed. Update the path and request the information.
			this.getProPresenterState()
		}
	}

	/**
	 * Received a message from Follower ProPresenter.
	 */
	onFollowerWebSocketMessage = (message) => {
		var objData
		// Try to parse websocket payload as JSON...
		try {
			objData = JSON.parse(message)
		} catch (err) {
			this.log('warn', err.message)
			return
		}

		switch (objData.action) {
			case 'authenticate':
				if (objData.authenticated === 1) {
					// Autodetect if Major version of ProPresenter is version 7
					// Only Pro7 includes .majorVersion and .minorVersion properties.
					// .majorVersion will be set to = "7" from Pro7 (Pro6 does not include these at all)
					if (objData.hasOwnProperty('majorVersion')) {
						this.log('info', 'Authenticated to Follower ProPresenter (Version: ' + objData.majorVersion + ')')
					}

					this.currentState.internal.wsFollowerConnected = true

					this.checkFeedbacks('propresenter_follower_connected')
				} else {
					this.updateStatus(InstanceStatus.UnknownWarning)
					this.log('warn', 'Failed to authenticate to Follower ProPresenter' + objData.error)
					this.disconnectFromFollowerProPresenter()

					// No point in trying to connect again. The user must either re-enable this
					//	module or re-save the config changes to make another attempt.
					this.stopFollowerConnectionTimer()

					this.currentState.internal.wsFollowerConnected = false
				}
				break

			case 'presentationTriggerIndex':
			case 'presentationSlideIndex':
				// Update the current slide index.
				var slideIndex = parseInt(objData.slideIndex, 10)
				this.log('debug', 'Follower presentationSlideIndex: ' + slideIndex)
				break

			case 'presentationCurrent':
				var objPresentation = objData.presentation

				// Pro6 PC's 'presentationName' contains the raw file extension '.pro6'. Remove it.
				var presentationName = objPresentation.presentationName.replace(/\.pro6$/i, '')
				this.log('info', 'Follower presentationCurrent: ' + presentationName)
				break
		}
	}

	/**
	 * Received a stage display message from ProPresenter.
	 */
	onSDWebSocketMessage = (message) => {
		var objData
		// Try to parse websocket payload as JSON...
		try {
			objData = JSON.parse(message)
		} catch (err) {
			this.log('warn', err.message)
			return
		}

		switch (objData.acn) {
			case 'ath':
				if (objData.ath === true) {
					this.currentState.internal.wsSDConnected = true
					// Successfully authenticated.
					this.setSDConnectionVariable('Connected', true)
					this.updateStatus(InstanceStatus.Ok)
				} else {
					// Bad password
					if (this.config.use_sd === 'yes') {
						this.updateStatus(InstanceStatus.UnknownWarning, 'OK, But Stage Display failed auth')
						this.log('warn', 'Stage Display auth error: ' + String(objData.err))
					}
					this.stopSDConnectionTimer()
				}
				break

			case 'vid':
				if (objData.hasOwnProperty('txt')) {
					// Record new video countdown timer value in dynamic var
					this.updateVariable('video_countdown_timer', objData.txt)
					// Convert video countdown timer to hourless
					this.updateVariable('video_countdown_timer_hourless', this.formatClockTime(objData.txt, false))
					// Convert video countdown timer to total seconds
					this.updateVariable('video_countdown_timer_totalseconds', this.convertToTotalSeconds(objData.txt))
				}
				break
		}
	}

	/**
	 * Requests the current state from ProPresenter.
	 */
	getProPresenterState = (refreshCurrentPresentation = false) => {
		if (this.currentState.internal.wsConnected === false) {
			return
		}

		if (refreshCurrentPresentation) {
			this.log('debug', 'presentationCurrent')
			// Force send presentationCurrent with presentationSlideQuality = '0' (string) (25-Jan-2022 This was the default way "always". It Performs well for Pro7 and Pro6 on MacOS - very slow for Pro6/7 on Windows)
			this.socket.send(
				JSON.stringify({
					action: 'presentationCurrent',
					presentationSlideQuality: '0', // Setting to 0 stops Pro from including the slide preview image data (which is a lot of data) - no need to get slide preview images since we are not using them!
				})
			)
		} else {
			if (this.config.sendPresentationCurrentMsgs !== 'no') {
				// User can optionally block sending these msgs to ProPresenter (as it can cause performance issues with ProPresenter on Windows)
				if (this.config.typeOfPresentationRequest == 'auto') {
					// Decide which type of request to get current presentation info
					// Just send presentationCurrent with presentationSlideQuality = '0' (string) (25-Jan-2022 This was the default way "always". It Performs well for Pro7 and Pro6 on MacOS - very slow for Pro6/7 on Windows)
					this.socket.send(
						JSON.stringify({
							action: 'presentationCurrent',
							presentationSlideQuality: '0', // Setting to 0 stops Pro from including the slide preview image data (which is a lot of data) - no need to get slide preview images since we are not using them!
						})
					)
				} else {
					// Send presentationRequest with presentationSlideQuality = 0 (int) (At time of adding this option, this was only method that performs well for Pro7.8+ on Mac/Win and Pro6 on Mac)
					this.socket.send(
						JSON.stringify({
							action: 'presentationRequest',
							presentationSlideQuality: 0, // Setting to 0 stops Pro from including the slide preview image data (which is a lot of data) - no need to get slide preview images since we are not using them!
							presentationPath: this.currentState.dynamicVariables['current_presentation_path'],
						})
					)
				}
			}
		}

		if (this.currentState.dynamicVariables.current_slide === 'N/A') {
			// The currentSlide will be empty when the module first loads. Request it.
			this.socket.send(
				JSON.stringify({
					action: 'presentationSlideIndex',
				})
			)
		}
	}

	/*
	 * Requests the list of configured stage displays (includes names)
	 */
	getStageDisplaysInfo = () => {
		if (this.currentState.internal.wsConnected === false) {
			return
		}

		this.socket.send(
			JSON.stringify({
				action: 'stageDisplaySets',
			})
		)
	}

	/*
	 * Request Looks List
	 */
	getLooksList = () => {
		if (this.currentState.internal.wsConnected === false) {
			return
		}

		this.socket.send(
			JSON.stringify({
				action: 'looksRequest',
			})
		)
	}

	/*
	 * Request Macros List
	 */
	getMacrosList = () => {
		if (this.currentState.internal.wsConnected === false) {
			return
		}

		this.socket.send(
			JSON.stringify({
				action: 'macrosRequest',
			})
		)
	}

	/*
	 * Format Time string
	 */
	formatClockTime = (clockTimeString, includeHours = true) => {
		// Record if time is negative
		var timeIsNegative = false
		if (clockTimeString.length > 0) {
			timeIsNegative = clockTimeString.charAt(0) == '-'
		}

		// Remove decimal (sub-seconds) and save in formattedClockTimeString
		var formattedClockTimeString = ''
		if (clockTimeString.indexOf('.') > 0) {
			formattedClockTimeString = clockTimeString.slice(0, clockTimeString.indexOf('.'))
		} else {
			formattedClockTimeString = clockTimeString
		}

		var hours = ''
		var minutes = ''
		var seconds = ''
		var timeParts = formattedClockTimeString.split(':')
		if (timeParts.length == 3) {
			hours = timeParts.shift()
		}
		if (timeParts.length == 2) {
			minutes = timeParts.shift()
		}
		if (timeParts.length == 1) {
			seconds = timeParts.shift()
		}

		if (includeHours) {
			return hours + ':' + minutes + ':' + seconds
		} else {
			// If time was negative the negative sign will in the hours component that is not returned here.  Add a negtive sign to the minutes component.
			if (timeIsNegative) {
				minutes = '-' + minutes
			}
			return minutes + ':' + seconds
		}
	}

	/*
	 * Conver Time string to total seconds
	 */
	convertToTotalSeconds = (clockTimeString) => {
		var totalSeconds = 0

		// Record if time is negative
		var timeIsNegative = false
		if (clockTimeString.length > 0) {
			timeIsNegative = clockTimeString.charAt(0) == '-'
		}

		// Remove any decimal (sub-seconds) and save in formattedClockTimeString
		var formattedClockTimeString = ''
		if (clockTimeString.indexOf('.') > 0) {
			formattedClockTimeString = clockTimeString.slice(0, clockTimeString.indexOf('.'))
		} else {
			formattedClockTimeString = clockTimeString
		}

		// If time is negative remove leading - prefix from string
		if (timeIsNegative) {
			formattedClockTimeString = formattedClockTimeString.slice(1)
		}

		var hours = 0
		var minutes = 0
		var seconds = 0
		var timeParts = formattedClockTimeString.split(':')
		if (timeParts.length == 3) {
			hours = parseInt(timeParts.shift())
			if (!isNaN(hours)) {
				totalSeconds = totalSeconds + 3600 * hours
			}
		}
		if (timeParts.length == 2) {
			minutes = parseInt(timeParts.shift())
			if (!isNaN(minutes)) {
				totalSeconds = totalSeconds + 60 * minutes
			}
		}
		if (timeParts.length == 1) {
			seconds = parseInt(timeParts.shift())
			if (!isNaN(seconds)) {
				totalSeconds = totalSeconds + seconds
			}
		}

		if (timeIsNegative) {
			totalSeconds = totalSeconds * -1
		}

		return totalSeconds
	}

	/*
	 * Recursively Scan PlaylistsObject to find first presentation that matches given name, in the first playlist that matches given name.
	 * Calls presentationRequest (whose response handler will complete the request)
	 */

	recursivelyScanPlaylistsObjToTriggerSlideByLabel = (playlistObj, playlistName, presentationName, slideLabel) => {
		Object.keys(playlistObj).forEach((key) => {
			if (this.currentState.internal.matchingPlaylistItemFound) {
				return
			}
			if (
				playlistObj.hasOwnProperty('playlistName') &&
				playlistObj.hasOwnProperty('playlist') &&
				playlistObj.playlistName == playlistName
			) {
				var matchingPlaylistItem = playlistObj.playlist.find(
					(playlistItem) =>
						playlistItem.hasOwnProperty('playlistItemName') &&
						this.matchRuleShort(playlistItem.playlistItemName, presentationName)
				) // matchRuleShort allows use of wildcard * anywhere in presentationName parameter
				if (matchingPlaylistItem !== undefined) {
					this.log('debug', 'Found match: ' + JSON.stringify(matchingPlaylistItem))
					this.currentState.internal.matchingPlaylistItemFound = true
					// Update this.currentState.internal.awaitingSlideByLabelRequest with the matching path (so response to presentationRequest can check)
					this.currentState.internal.awaitingSlideByLabelRequest.presentationPath =
						matchingPlaylistItem.playlistItemLocation
					// send presentationRequest
					cmd = {
						action: 'presentationRequest',
						presentationPath: this.currentState.internal.awaitingSlideByLabelRequest.presentationPath,
						presentationSlideQuality: 0,
					}
					try {
						if (this.socket.readyState == 1 /*OPEN*/) {
							this.socket.send(JSON.stringify(cmd))
						}
					} catch (e) {
						this.log('debug', 'Socket Send Error: ' + e.message)
					}
				}
			}

			if (typeof playlistObj[key] === 'object' && playlistObj[key] !== null) {
				this.recursivelyScanPlaylistsObjToTriggerSlideByLabel(
					playlistObj[key],
					playlistName,
					presentationName,
					slideLabel
				)
			}
		})
	}

	// Thanks to: https://stackoverflow.com/questions/26246601/wildcard-string-comparison-in-javascript/32402438#32402438
	matchRuleShort = (str, rule) => {
		var escapeRegex = (str) => str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1')
		return new RegExp('^' + rule.split('*').map(escapeRegex).join('.*') + '$').test(str)
	}
}
runEntrypoint(instance, [])
