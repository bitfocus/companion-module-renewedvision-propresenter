// @ts-check

/**
 * Register the available actions with Companion.
 */

const { Regex, InstanceStatus } = require('@companion-module/base')
const ActionId = {
	enableFollowerControl: 'enableFollowerControl',
	next: 'next',
	last: 'last',
	slideNumber: 'slideNumber',
	slideLabel: 'slideLabel',
	groupSlide: 'groupSlide',
	clearall: 'clearall',
	clearslide: 'clearslide',
	clearprops: 'clearprops',
	clearaudio: 'clearaudio',
	clearbackground: 'clearbackground',
	cleartelestrator: 'cleartelestrator',
	cleartologo: 'cleartologo',
	clearAnnouncements: 'clearAnnouncements',
	clearMessages: 'clearMessages',
	stageDisplayLayout: 'stageDisplayLayout',
	pro7StageDisplayLayout: 'pro7StageDisplayLayout',
	pro7SetLook: 'pro7SetLook',
	pro7TriggerMacro: 'pro7TriggerMacro',
	stageDisplayMessage: 'stageDisplayMessage',
	stageDisplayHideMessage: 'stageDisplayHideMessage',
	clockStart: 'clockStart',
	clockStop: 'clockStop',
	clockReset: 'clockReset',
	clockUpdate: 'clockUpdate',
	messageHide: 'messageHide',
	messageSend: 'messageSend',
	audioStartCue: 'audioStartCue',
	audioPlayPause: 'audioPlayPause',
	timelinePlayPause: 'timelinePlayPause',
	timelineRewind: 'timelineRewind',
	customAction: 'customAction',
	nwSpecificSlide: 'nwSpecificSlide',
	nwPropTrigger: 'nwPropTrigger',
	nwPropClear: 'nwPropClear',
	nwMessageClear: 'nwMessageClear',
	nwTriggerMedia: 'nwTriggerMedia',
	nwTriggerAudio: 'nwTriggerAudio',
	nwVideoInput: 'nwVideoInput',
	newRandomNumber: 'newRandomNumber',
	nwCustom: 'nwCustom',
}

const sendNwCommand = async (nwCmd) => {
	nwCmd.data.connection = { rejectUnauthorized: false } // Add this header now, in case of a change to https with invalid certs in future.
	this.instance.log(
		'debug',
		`Sending: http://${this.config.host}:${this.config.port}${nwCmd.endpointPath} ${JSON.stringify(nwCmd.data)}`
	)
	// Perform actions that use the new NetworkLink API (These actions are considered beta functionality until the new API is finalized by RV)
	const res = await fetch(`http://${this.config.host}:${this.config.port}${nwCmd.endpointPath}`, {
		body: JSON.stringify(nwCmd.data),
	})
	if (res.ok) {
		const data = await res.json()
		this.instance.log('debug', JSON.stringify(data))
	}

	// // fetch()
	// this.system.emit(
	// 	'rest',
	// 	'http://' + this.config.host + ':' + this.config.port + nwCmd.endpointPath,
	// 	JSON.stringify(nwCmd.data),
	// 	function (err, result) {
	// 		this.instance.log('debug', 'nwCMD.path: ' + nwCmd.endpointPath + ' nwCmd.data: ' + JSON.stringify(nwCmd.data))
	// 	},
	// 	{},
	// 	{ connection: { rejectUnauthorized: false } } // Add this header now, in case of a change to https with invalid certs in future.
	// )
}

const sendCommand = async (cmd) => {
	// Perform actions that use the current ProRemote API (Websocket)
	if (this.instance.currentStatus !== InstanceStatus.UnknownError) {
		// Is this the correct check?
		try {
			const cmdJSON = JSON.stringify(cmd)
			this.instance.log('debug', 'Sending JSON: ' + cmdJSON)
			this.instance.socket.send(cmdJSON)
		} catch (e) {
			this.instance.log('debug', 'NETWORK ' + e)
			this.instance.updateStatus(InstanceStatus.UnknownError, e.message)
		}
	} else {
		this.instance.log('debug', 'Socket not connected :(')
		this.instance.updateStatus(InstanceStatus.ConnectionFailure, 'not connected')
	}
}

module.exports = {
	GetActions: (instance) => {
		this.instance = instance

		/**
		 * @type{import('@companion-module/base').CompanionActionDefinitions}
		 */
		const actions = {
			[ActionId.next]: {
				name: 'Next Slide',
				options: [],
				callback: async () => {
					const cmd = {
						action: 'presentationTriggerNext',
						presentationDestination: '0', // Pro7.4.2 seems to need this now!
					}
					await sendCommand(cmd)
				},
			},
			[ActionId.last]: {
				name: 'Previous Slide',
				options: [],
				callback: async () => {
					const cmd = {
						action: 'presentationTriggerPrevious',
						presentationDestination: '0', // Pro7.4.2 seems to need this now!
					}
					await sendCommand(cmd)
				},
			},
			[ActionId.slideNumber]: {
				name: 'Specific Slide',
				options: [
					{
						type: 'textinput',
						useVariables: true,
						label: 'Slide Number',
						id: 'slide',
						default: '1',
						tooltip: '(Supports variable)',
						regex: Regex.SIGNED_NUMBER,
					},
					{
						type: 'textinput',
						useVariables: true,
						label: 'Presentation Path',
						id: 'path',
						default: '',
						tooltip: 'See the README for more information (Supports variable)',
						regex: '/^$|^\\d+$|^\\d+(\\.\\d+)*:\\d+$/',
					},
				],
				callback: async (action, context) => {
					let index = this.instance.currentState.internal.slideIndex // Start with current slide (allows relative jumps using+-)

					// Allow parsing of optional variable in the slide textfield as int
					// Picking a var from the dropdown seems to add a space on end (use trim() to ensure field is a just a clean variable)
					const optSlideIndex = await context.parseVariablesInString(String(action.options.slide).trim())

					if (action.options.slide[0] === '-' || action.options.slide[0] === '+') {
						// Move back/forward a relative number of slides.
						index += parseInt(action.options.slide.substring(1), 10) * (action.options.slide[0] === '+' ? 1 : -1)
						index = Math.max(0, index)
					} else {
						// Absolute slide number. Convert to an index.
						index = parseInt(optSlideIndex) - 1
					}

					if (index < 0) {
						// Negative slide indexes are invalid. In such a case use the current slideIndex.
						// This allows the "Specific Slide", when set to 0 (thus the index is -1), to
						//  trigger the current slide again. Can be used to bring back a slide after using
						//  an action like 'clearAll' or 'clearText'.
						index = this.instance.currentState.internal.slideIndex
					}

					// Allow parsing of optional variable in the presentationPath textfield as string
					// Picking a var from the dropdown seems to add a space on end (use trim() to ensure field is a just a clean variable)
					const optPath = await context.parseVariablesInString(String(action.options.path).trim())

					let presentationPath = this.instance.currentState.internal.presentationPath // Default to current stored presentationPath
					// TODO: Pro7 Win workaround: If current path is C:/*.pro then find matching path in all playlists and use that instead!
					// This users cannot use specific slide with blank path to target presentations in the library (if a match can be found in a playlist we will always assume that is the intention)
					//  Also, the first match will be win every time - (if the same presentation is in in mulitple playlists)
					if (action.options.path !== undefined && String(action.options.path).match(/^\d+$/) !== null) {
						// Is a relative presentation path. Refers to the current playlist, so extract it
						//  from the current presentationPath and append the action.options.path to it.
						presentationPath = presentationPath.split(':')[0] + ':' + action.options.path
					} else if (action.options.path !== '') {
						// Use the path provided. The option's regex validated the format.
						presentationPath = optPath
					}

					const cmd = {
						action: 'presentationTriggerIndex',
						slideIndex: String(index),
						// Pro 6 for Windows requires 'presentationPath' to be set.
						presentationPath: presentationPath,
					}
					await sendCommand(cmd)
				},
			},
			[ActionId.slideLabel]: {
				name: 'Specific Slide With Label',
				options: [
					{
						type: 'textinput',
						useVariables: true,
						label: 'Playlist Name',
						tooltip: 'Find the first playlist with that matches this playlist name (Supports variable)',
						id: 'playlistName',
					},
					{
						type: 'textinput',
						useVariables: true,
						label: 'Presentation Name',
						tooltip:
							'Find the first presentation (in above playlist) that matches this presentation name (Supports variable or text with wildcard char *)',
						id: 'presentationName',
					},
					{
						type: 'textinput',
						useVariables: true,
						label: 'Slide With Label',
						tooltip:
							'Find the first slide (in above presentation) with matching *Slide Label* and trigger that slide (Supports variable)',
						id: 'slideLabel',
					},
				],
				callback: async (action, context) => {
					// Allow parsing of optional variables in all input fields for this action
					const playlistName = await context.parseVariablesInString(String(action.options.playlistName).trim())
					const presentationName = await context.parseVariablesInString(String(action.options.presentationName).trim())
					const slideLabel = await context.parseVariablesInString(String(action.options.slideLabel).trim())

					// Add new request to internal state and issue request for all playlists (later, code the handles response will see the request stored in internal state and perform the work to complete it)
					const newSlideByLabelRequest = {
						playlistName: playlistName,
						presentationName: presentationName,
						slideLabel: slideLabel,
					}
					this.instance.currentState.internal.awaitingSlideByLabelRequest = newSlideByLabelRequest

					const cmd = {
						action: 'playlistRequestAll',
					}
					await sendCommand(cmd)
				},
			},
			[ActionId.groupSlide]: {
				name: 'Specific Slide In A Group',
				options: [
					{
						type: 'textinput',
						useVariables: true,
						label: 'Group(s) Name',
						tooltip:
							'Specify the Name of the Group with the slide you want to trigger (Supports variable or multiple group names separated by |)',
						id: 'groupName', // Supports multiple group names with | separator
					},
					{
						type: 'textinput',
						useVariables: true,
						label: 'Slide Number (Within Group)',
						default: '1',
						tooltip: 'Which slide in the group? (Supports variable)',
						id: 'slideNumber',
						regex: Regex.NUMBER,
					},
					{
						type: 'textinput',
						useVariables: true,
						label: 'Presentation Path (Leave Blank for Current)',
						id: 'presentationPath',
						default: '',
						tooltip: 'Leave this blank to target the current presentation (Supports variable)',
						regex: '/^$|^\\d+$|^\\d+(\\.\\d+)*:\\d+$/',
					},
				],
				callback: async (action, context) => {
					// Allow parsing of optional variables in all input fields for this action
					const groupName = await context.parseVariablesInString(String(action.options.groupName).trim())
					const slideNumber = await context.parseVariablesInString(String(action.options.slideNumber).trim())
					let presentationPath = await context.parseVariablesInString(String(action.options.presentationPath).trim())

					// If presentationPath was blank then auto set to current presentation.
					if (presentationPath.length == 0) {
						presentationPath = this.instance.currentState.dynamicVariables['current_presentation_path']
					}

					if (presentationPath !== undefined && presentationPath !== 'undefined' && presentationPath.length > 0) {
						// Add new request to internal state and issue presentationRequest (later, code the handles the "presentationCurrent" response will see the request stored in internal state and perform the work to complete it)
						const newGroupSlideRequest = {
							groupName: groupName,
							slideNumber: slideNumber,
							presentationPath: presentationPath,
						}
						this.instance.currentState.internal.awaitingGroupSlideRequest = newGroupSlideRequest

						const cmd = {
							action: 'presentationRequest',
							presentationPath: presentationPath,
							presentationSlideQuality: 0,
						}
						await sendCommand(cmd)
					}
				},
			},
			[ActionId.clearall]: {
				name: 'Clear All',
				options: [],
				callback: async () => {
					const cmd = {
						action: 'clearAll',
					}
					await sendCommand(cmd)
				},
			},
			[ActionId.clearslide]: {
				name: 'Clear Slide',
				options: [],
				callback: async () => {
					const cmd = {
						action: 'clearText',
					}
					await sendCommand(cmd)
				},
			},
			[ActionId.clearprops]: {
				name: 'Clear Props',
				options: [],
				callback: async () => {
					const cmd = {
						action: 'clearProps',
					}
					await sendCommand(cmd)
				},
			},
			[ActionId.clearaudio]: {
				name: 'Clear Audio',
				options: [],
				callback: async () => {
					const cmd = {
						action: 'clearAudio',
					}
					await sendCommand(cmd)
				},
			},
			[ActionId.clearbackground]: {
				name: 'Clear Background',
				options: [],
				callback: async () => {
					const cmd = {
						action: 'clearVideo',
					}
					await sendCommand(cmd)
				},
			},
			[ActionId.cleartelestrator]: {
				name: 'Clear Telestrator',
				options: [],
				callback: async () => {
					const cmd = {
						action: 'clearTelestrator',
					}
					await sendCommand(cmd)
				},
			},
			[ActionId.cleartologo]: {
				name: 'Clear to Logo',
				options: [],
				callback: async () => {
					const cmd = {
						action: 'clearToLogo',
					}
					await sendCommand(cmd)
				},
			},
			[ActionId.clearAnnouncements]: {
				name: 'Clear Announcements',
				options: [],
				callback: async () => {
					const cmd = {
						action: 'clearAnnouncements',
					}
					await sendCommand(cmd)
				},
			},
			[ActionId.clearMessages]: {
				name: 'Clear Messages',
				options: [],
				callback: async () => {
					const cmd = {
						action: 'clearMessages',
					}
					await sendCommand(cmd)
				},
			},
			[ActionId.stageDisplayLayout]: {
				name: 'Pro6 Stage Display Layout',
				options: [
					{
						type: 'textinput',
						label: 'Pro6 Stage Display Index',
						id: 'index',
						default: '0',
						regex: Regex.NUMBER,
					},
				],
				callback: async (action) => {
					const cmd = {
						action: 'stageDisplaySetIndex',
						stageDisplayIndex: String(action.options.index),
					}
					await sendCommand(cmd)
				},
			},
			[ActionId.pro7StageDisplayLayout]: {
				name: 'Pro7 Stage Display Layout',
				options: [
					{
						type: 'dropdown',
						label: 'Pro7 Stage Display Screen',
						id: 'pro7StageScreenUUID',
						tooltip: 'Choose which stage display screen you want to update layout',
						default: '',
						choices: this.instance.currentState.internal.pro7StageScreens,
					},
					{
						type: 'dropdown',
						label: 'Pro7 Stage Display Layout',
						id: 'pro7StageLayoutUUID',
						tooltip: 'Choose the new stage display layout to apply',
						default: '',
						choices: this.instance.currentState.internal.pro7StageLayouts,
					},
				],
				callback: async (action) => {
					// If either option is null, then default to using first items from each list kept in internal state.
					const cmd = {
						action: 'stageDisplayChangeLayout',
						stageScreenUUID: action.options.pro7StageScreenUUID
							? action.options.pro7StageScreenUUID
							: this.instance.currentState.internal.pro7StageScreens[0].id,
						stageLayoutUUID: action.options.pro7StageLayoutUUID
							? action.options.pro7StageLayoutUUID
							: this.instance.currentState.internal.pro7StageLayouts[0].id,
					}
					await sendCommand(cmd)
				},
			},
			[ActionId.pro7SetLook]: {
				name: 'Pro7 Set Look',
				options: [
					{
						type: 'dropdown',
						label: 'Look',
						id: 'pro7LookUUID',
						tooltip: 'Choose which Look to make live',
						default: '',
						choices: this.instance.currentState.internal.pro7Looks,
					},
				],
				callback: async (action) => {
					// If selected Look is null, then default to using first Look from list kept in internal state
					const cmd = {
						action: 'looksTrigger',
						lookID: action.options.pro7LookUUID
							? action.options.pro7LookUUID
							: this.instance.currentState.internal.pro7Looks[0].id,
					}
					await sendCommand(cmd)
				},
			},
			[ActionId.pro7TriggerMacro]: {
				name: 'Pro7 Trigger Macro',
				options: [
					{
						type: 'dropdown',
						label: 'Macro',
						id: 'pro7MacroUUID',
						tooltip: 'Choose which Macro to trigger',
						default: '',
						choices: this.instance.currentState.internal.pro7Macros,
					},
				],
				callback: async (action) => {
					// If selected Macro is null, then default to using first Macro from list kept in internal state
					const cmd = {
						action: 'macrosTrigger',
						macroID: action.options.pro7MacroUUID
							? action.options.pro7MacroUUID
							: this.instance.currentState.internal.pro7Macros[0].id,
					}
					await sendCommand(cmd)
				},
			},
			[ActionId.stageDisplayMessage]: {
				name: 'Stage Display Message',
				options: [
					{
						type: 'textinput',
						label: 'Message',
						id: 'message',
						default: '',
					},
				],
				callback: async (action) => {
					//var message = JSON.stringify(action.options.message);
					//cmd = '{"action":"stageDisplaySendMessage","stageDisplayMessage":'+message+'}';
					const cmd = {
						action: 'stageDisplaySendMessage',
						stageDisplayMessage: action.options.message,
					}
					await sendCommand(cmd)
				},
			},
			[ActionId.stageDisplayHideMessage]: {
				name: 'Stage Display Hide Message',
				options: [],
				callback: async () => {
					const cmd = {
						action: 'stageDisplayHideMessage',
					}
					await sendCommand(cmd)
				},
			},
			[ActionId.clockStart]: {
				name: 'Start Clock',
				options: [
					{
						type: 'textinput',
						label: 'Clock Number',
						id: 'clockIndex',
						default: '0',
						tooltip: 'Zero based index of countdown clock - first one is 0, second one is 1 and so on...',
						regex: Regex.NUMBER,
					},
				],
				callback: async (action) => {
					var clockIndex = String(action.options.clockIndex)
					const cmd = {
						action: 'clockStart',
						clockIndex: clockIndex,
					}
					await sendCommand(cmd)
				},
			},
			[ActionId.clockStop]: {
				name: 'Stop Clock',
				options: [
					{
						type: 'textinput',
						label: 'Clock Number',
						id: 'clockIndex',
						default: '0',
						tooltip: 'Zero based index of countdown clock - first one is 0, second one is 1 and so on...',
						regex: Regex.NUMBER,
					},
				],
				callback: async (action) => {
					var clockIndex = String(action.options.clockIndex)
					const cmd = {
						action: 'clockStop',
						clockIndex: clockIndex,
					}
					await sendCommand(cmd)
				},
			},
			[ActionId.clockReset]: {
				name: 'Reset Clock',
				options: [
					{
						type: 'textinput',
						label: 'Clock Number',
						id: 'clockIndex',
						default: '0',
						tooltip: 'Zero based index of countdown clock - first one is 0, second one is 1 and so on...',
						regex: Regex.NUMBER,
					},
				],
				callback: async (action) => {
					var clockIndex = String(action.options.clockIndex)
					const cmd = {
						action: 'clockReset',
						clockIndex: clockIndex,
					}
					await sendCommand(cmd)
				},
			},
			[ActionId.clockUpdate]: {
				name: 'Update Clock',
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
						default: '0',
						tooltip: 'Zero based index of countdown clock - first one is 0, second one is 1 and so on...',
						regex: Regex.NUMBER,
					},
					{
						type: 'textinput',
						label: 'Countdown Duration, Elapsed Start Time or Countdown To Time',
						id: 'clockTime',
						default: '00:05:00',
						tooltip:
							'New duration (or time) for countdown clocks. Also used as optional starting time for elapsed time clocks. Formatted as HH:MM:SS - but you can also use other (shorthand) formats, see the README for more information',
						regex: '/^[-|+]?\\d*:?\\d*:?\\d*$/',
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
						regex: '/^[-|+]?\\d*:?\\d*:?\\d*$/',
					},
				],
				callback: async (action) => {
					var clockIndex = String(action.options.clockIndex)

					// Protect against option values which may be missing if this action is called from buttons that were previously saved before these options were added to the clockUpdate action!
					// If they are missing, then apply default values that result in the oringial bahaviour when it was only updating a countdown timers clockTime and clockOverRun.
					if (!action.options.hasOwnProperty('clockType')) {
						action.options.clockType = '0'
					}
					if (!action.options.hasOwnProperty('clockIsPM')) {
						action.options.clockIsPM = '0'
					}
					if (!action.options.hasOwnProperty('clockElapsedTime')) {
						action.options.clockElapsedTime = '00:10:00'
					}
					if (!action.options.hasOwnProperty('clockName')) {
						action.options.clockName = ''
					}

					// Allow +- prefix to update increment/decrement clockTime
					var newClockTime = action.options.clockTime
					if (newClockTime.charAt(0) == '-' || newClockTime.charAt(0) == '+') {
						var deltaSeconds = this.instance.convertToTotalSeconds(newClockTime)
						newClockTime =
							'00:00:' +
							String(
								parseInt(this.instance.currentState.dynamicVariables['pro7_clock_' + clockIndex + '_totalseconds']) +
									parseInt(deltaSeconds)
							)
						var newSeconds =
							parseInt(this.instance.currentState.dynamicVariables['pro7_clock_' + clockIndex + '_totalseconds']) +
							parseInt(deltaSeconds)
						if (newSeconds < 0) {
							newClockTime = '-00:00:' + String(newSeconds)
						} else {
							newClockTime = '00:00:' + String(newSeconds)
						}
					}

					// Allow +- prefix to update increment/decrement clockElapsedTime
					var newclockElapsedTime = action.options.clockElapsedTime
					if (newclockElapsedTime.charAt(0) == '-' || newclockElapsedTime.charAt(0) == '+') {
						var deltaSeconds = this.instance.convertToTotalSeconds(newclockElapsedTime)
						newclockElapsedTime =
							'00:00:' +
							String(
								parseInt(this.instance.currentState.dynamicVariables['pro7_clock_' + clockIndex + '_totalseconds']) +
									parseInt(deltaSeconds)
							)
						var newSeconds =
							parseInt(this.instance.currentState.dynamicVariables['pro7_clock_' + clockIndex + '_totalseconds']) +
							parseInt(deltaSeconds)
						if (newSeconds < 0) {
							newclockElapsedTime = '-00:00:' + String(newSeconds)
						} else {
							newclockElapsedTime = '00:00:' + String(newSeconds)
						}
					}

					const cmd = {
						action: 'clockUpdate',
						clockIndex: clockIndex,
						clockTime: newClockTime,
						clockOverrun: action.options.clockOverRun,
						clockType: action.options.clockType,
						clockIsPM:
							String(action.options.clockTimePeriodFormat) < 2 ? String(action.options.clockTimePeriodFormat) : '2', // Pro6 just wants a 1 (PM) or 0 (AM)
						clockTimePeriodFormat: String(action.options.clockTimePeriodFormat),
						clockElapsedTime:
							action.options.clockType === '1' && this.instance.currentState.internal.proMajorVersion === 7
								? newClockTime
								: newclockElapsedTime, // When doing countdown to time (clockType==='1'), Pro7 uses clockElapsed value for the "countdown-to-time", so we grab this from clocktime above where the user has entered it (Pro6 uses clocktime for countdown-to-time value)
						clockName: action.options.clockName,
					}
					await sendCommand(cmd)
				},
			},
			[ActionId.messageSend]: {
				name: 'Show Message',
				options: [
					{
						type: 'textinput',
						useVariables: true,
						label: 'Message Index',
						id: 'messageIndex',
						default: '0',
						tooltip:
							'Zero based index of message to show - first one is 0, second one is 1 and so on...(Supports variable)',
						regex: Regex.NUMBER,
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
						useVariables: true,
						label: 'Comma Separated List Of Message Token Values',
						id: 'messageValues',
						default: '',
						tooltip:
							'Comma separated, list of values for each message token above. Use double commas (,,) to insert an actual comma in a token value. You can optionally use a single variable. (Supports variable. WARNING! - A simple typo here could crash and burn ProPresenter)',
					},
				],
				callback: async (action, context) => {
					// Picking a var from the dropdown seems to add a space on end (use trim() to ensure field is a just a clean variable)
					const messageIndex = await context.parseVariablesInString(String(action.options.messageIndex).trim())

					// The below "replace...split dance" for messageKeys and MessageValues produces the required array of items from the comma-separated list of values entered by the user. It also allows double commas (,,) to be treated as an escape method for the user to include a literal comma in the values if desired.
					// It works by first replacing any double commas with a character 29 (ascii group seperator char), and then replacing any single commas with a character 28 (ascii file seperator char).  Then it can safely replace character 29 with a comma and finally split using character 28 as the separator.
					// Note that character 28 and 29 are not "normally typed characters" and therefore considered (somewhat) safe to insert into the string as special markers during processing. Also note that CharCode(29) is matched by regex /\u001D/
					const cmd = {
						action: 'messageSend',
						messageIndex:
							messageIndex !== 'undefined' && messageIndex !== undefined && parseInt(messageIndex) >= 0
								? String(messageIndex)
								: '0',
						messageKeys: action.options.messageKeys
							.replace(/,,/g, String.fromCharCode(29))
							.replace(/,/g, String.fromCharCode(28))
							.replace(/\u001D/g, ',')
							.split(String.fromCharCode(28)),
						messageValues: action.options.messageValues
							.replace(/,,/g, String.fromCharCode(29))
							.replace(/,/g, String.fromCharCode(28))
							.replace(/\u001D/g, ',')
							.split(String.fromCharCode(28)),
					}
					// If there is only one message value - then allow parsing of optional variables...
					if (cmd.messageValues.length == 1) {
						// Allow parsing of optional variable in the Message values textfield
						// Picking a var from the dropdown seems to add a space on end (use trim() to ensure field is a just a clean variable)
						cmd.messageValues[0] = await context.parseVariablesInString(String(cmd.messageValues[0]).trim())
					}
					await sendCommand(cmd)
				},
			},
			[ActionId.messageHide]: {
				name: 'Hide Message',
				options: [
					{
						type: 'textinput',
						useVariables: true,
						label: 'Message Index',
						id: 'messageIndex',
						default: '0',
						tooltip:
							'Zero based index of message to hide - first one is 0, second one is 1 and so on...(Supports variable)',
						regex: Regex.NUMBER,
					},
				],
				callback: async (action, context) => {
					// Picking a var from the dropdown seems to add a space on end (use trim() to ensure field is a just a clean variable)
					const messageIndex = await context.parseVariablesInString(String(action.options.messageIndex).trim())

					const cmd = {
						action: 'messageHide',
						messageIndex:
							messageIndex !== 'undefined' && messageIndex !== undefined && parseInt(messageIndex) >= 0
								? String(messageIndex)
								: '0',
					}
					await sendCommand(cmd)
				},
			},
			[ActionId.audioStartCue]: {
				name: 'Audio Start Cue',
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
				callback: async (action) => {
					const cmd = {
						action: 'audioStartCue',
						audioChildPath: action.options.audioChildPath,
					}
					await sendCommand(cmd)
				},
			},
			[ActionId.audioPlayPause]: {
				name: 'Audio Play/Pause',
				options: [],
				callback: async () => {
					const cmd = {
						action: 'audioPlayPause',
					}
					await sendCommand(cmd)
				},
			},
			[ActionId.timelinePlayPause]: {
				name: 'Timeline Play/Pause',
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
				callback: async (action) => {
					const cmd = {
						action: 'timelinePlayPause',
						presentationPath: action.options.presentationPath,
					}
					await sendCommand(cmd)
				},
			},
			[ActionId.timelineRewind]: {
				name: 'Timeline Rewind',
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
				callback: async (action) => {
					const cmd = {
						action: 'timelineRewind',
						presentationPath: action.options.presentationPath,
					}
					await sendCommand(cmd)
				},
			},
			[ActionId.enableFollowerControl]: {
				name: 'Enable Follower Control',
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
				callback: async (action) => {
					this.config.control_follower = action.options.enableFollowerControl
					this.checkFeedbacks('propresenter_follower_connected')
				},
			},
			[ActionId.nwSpecificSlide]: {
				name: 'Specific Slide (Network Link)',
				options: [
					{
						type: 'textinput',
						label: 'Playlist Name',
						id: 'playlistName',
						tooltip:
							'Name of the PlayList that contains the presentation with the slide you want to trigger (Case Sensitive)',
					},
					{
						type: 'textinput',
						label: 'Presentation Name',
						id: 'presentationName',
						tooltip: 'Name of the presentation with the slide you want to trigger (Case Sensitive)',
					},
					{
						type: 'textinput',
						useVariables: true,
						label: 'Slide Index',
						id: 'slideIndex',
						tooltip: 'Index of the slide you want to trigger (1-based. Supports variable)',
						regex: Regex.NUMBER,
					},
					/* Does not seem to do anything (yet)
            {
                type: 'textinput',
                label: 'Slide Name',
                id: 'slideName',
                tooltip: 'Name of the slide you want to trigger',
            }, */
				],
				callback: async (action, context) => {
					// Picking a var from the dropdown seems to add a space on end (use trim() to ensure field is a just a clean variable)
					const slideIndex = await context.parseVariablesInString(String(action.options.slideIndex).trim())

					const nwCmd = {
						endpointPath: '/trigger/playlist',
						data: {
							path: [
								{
									name: action.options.playlistName,
								},
								{
									name: action.options.presentationName,
								},
								{
									index:
										slideIndex !== 'undefined' && slideIndex !== undefined && parseInt(slideIndex) > 0
											? Number(slideIndex) - 1
											: null,
								},
								//name: action.options.slideName !== undefined && String(action.options.slideName).length > 0 ? action.options.slideName : null // Slide name does nothing - maybe one day it will.
							],
						},
					}
					await sendNwCommand(nwCmd)
				},
			},
			[ActionId.nwPropTrigger]: {
				name: 'Prop Trigger (Network Link)',
				options: [
					{
						type: 'textinput',
						useVariables: true,
						label: 'Prop Index',
						id: 'propIndex',
						tooltip: 'Index of the Prop you want to trigger (1-based. Supports variable)',
						regex: Regex.NUMBER,
					},
					{
						type: 'textinput',
						label: 'Prop Name',
						id: 'propName',
						tooltip: 'Name of the Prop you want to trigger (Case Sensitive)',
					},
				],
				callback: async (action, context) => {
					// Picking a var from the dropdown seems to add a space on end (use trim() to ensure field is a just a clean variable)
					const propIndex = await context.parseVariablesInString(String(action.options.propIndex).trim())

					const nwCmd = {
						endpointPath: '/prop/trigger',
						data: {
							id: {
								index:
									propIndex !== 'undefined' && propIndex !== undefined && parseInt(propIndex) > 0
										? Number(propIndex) - 1
										: null,
								name:
									action.options.propName !== undefined && String(action.options.propName).length > 0
										? action.options.propName
										: null,
							},
						},
					}
					await sendNwCommand(nwCmd)
				},
			},
			[ActionId.nwPropClear]: {
				name: 'Prop Clear (Network Link)',
				options: [
					{
						type: 'textinput',
						useVariables: true,
						label: 'Prop Index',
						id: 'propIndex',
						tooltip: 'Index of the Prop you want to clear (1-based. Supports variable)',
						regex: Regex.NUMBER,
					},
					{
						type: 'textinput',
						label: 'Prop Name',
						id: 'propName',
						tooltip: 'Name of the Prop you want to clear (Case Sensitive)',
					},
				],
				callback: async (action, context) => {
					// Picking a var from the dropdown seems to add a space on end (use trim() to ensure field is a just a clean variable)
					const propIndex = await context.parseVariablesInString(String(action.options.propIndex).trim())

					const nwCmd = {
						endpointPath: '/prop/clear',
						data: {
							id: {
								index:
									propIndex !== 'undefined' && propIndex !== undefined && parseInt(propIndex) > 0
										? Number(propIndex) - 1
										: null,
								name:
									action.options.propName !== undefined && String(action.options.propName).length > 0
										? action.options.propName
										: null,
							},
						},
					}
					await sendNwCommand(nwCmd)
				},
			},
			[ActionId.nwMessageClear]: {
				name: 'Message Clear (Network Link)',
				options: [
					{
						type: 'textinput',
						useVariables: true,
						label: 'Message Index',
						id: 'messageIndex',
						tooltip: 'Index of the Message you want to clear (1-based. Supports variable)',
						regex: Regex.NUMBER,
					},
					{
						type: 'textinput',
						label: 'Message Name',
						id: 'messageName',
						tooltip: 'Name of the Message you want to clear (Case Sensitive)',
					},
				],
				callback: async (action, context) => {
					// Picking a var from the dropdown seems to add a space on end (use trim() to ensure field is a just a clean variable)
					const messageIndex = await context.parseVariablesInString(String(action.options.messageIndex).trim())

					const nwCmd = {
						endpointPath: '/message/clear',
						data: {
							id: {
								index:
									messageIndex !== 'undefined' && messageIndex !== undefined && parseInt(messageIndex) > 0
										? Number(messageIndex) - 1
										: null,
								name:
									action.options.messageName !== undefined && String(action.options.messageName).length > 0
										? action.options.messageName
										: null,
							},
						},
					}
					await sendNwCommand(nwCmd)
				},
			},
			[ActionId.nwTriggerMedia]: {
				name: 'Trigger Media (Network Link)',
				options: [
					{
						type: 'textinput',
						label: 'Media Playlist Name',
						id: 'playlistName',
						tooltip: 'Name of the Media PlayList that contains the media file you want to trigger (Case Sensitive)',
					},
					{
						type: 'textinput',
						useVariables: true,
						label: 'Media Index',
						id: 'mediaIndex',
						tooltip: 'Index of the media file you want to trigger (1-based. Supports variable)',
						regex: Regex.NUMBER,
					},
					{
						type: 'textinput',
						label: 'Media Name',
						id: 'mediaName',
						tooltip: 'Name of the media file you want to trigger (Case Sensitive)',
					},
				],
				callback: async (action, context) => {
					// Picking a var from the dropdown seems to add a space on end (use trim() to ensure field is a just a clean variable)
					const mediaIndex = await context.parseVariablesInString(String(action.options.mediaIndex).trim())

					const nwCmd = {
						endpointPath: '/trigger/media',
						data: {
							path: [
								{
									name: action.options.playlistName,
								},
								{
									index:
										mediaIndex !== 'undefined' && mediaIndex !== undefined && parseInt(mediaIndex) > 0
											? Number(mediaIndex) - 1
											: null,
									name:
										action.options.mediaName !== undefined && String(action.options.mediaName).length > 0
											? action.options.mediaName
											: null,
								},
							],
						},
					}
					await sendNwCommand(nwCmd)
				},
			},
			[ActionId.nwTriggerAudio]: {
				name: 'Trigger Audio (Network Link)',
				options: [
					{
						type: 'textinput',
						label: 'Audio Playlist Name',
						id: 'playlistName',
						tooltip: 'Name of the Audio PlayList that contains the audio file you want to trigger (Case Sensitive)',
					},
					{
						type: 'textinput',
						useVariables: true,
						label: 'Audio Index',
						id: 'audioIndex',
						tooltip: 'Index of the audio file you want to trigger (1-based. Supports variable)',
						regex: Regex.NUMBER,
					},
					{
						type: 'textinput',
						label: 'Audio Name',
						id: 'audioName',
						tooltip: 'Name of the audio file you want to trigger (Case Sensitive)',
					},
				],
				callback: async (action, context) => {
					// Picking a var from the dropdown seems to add a space on end (use trim() to ensure field is a just a clean variable)
					const audioIndex = await context.parseVariablesInString(String(action.options.audioIndex).trim())

					const nwCmd = {
						endpointPath: '/trigger/audio',
						data: {
							path: [
								{
									name: action.options.playlistName,
								},
								{
									index:
										audioIndex !== 'undefined' && audioIndex !== undefined && parseInt(audioIndex) > 0
											? Number(audioIndex) - 1
											: null,
									name:
										action.options.audioName !== undefined && String(action.options.audioName).length > 0
											? action.options.audioName
											: null,
								},
							],
						},
					}
					await sendNwCommand(nwCmd)
				},
			},
			[ActionId.nwVideoInput]: {
				name: 'Trigger Video Input (Network Link)',
				options: [
					{
						type: 'textinput',
						useVariables: true,
						label: 'Video Index',
						id: 'videoInputIndex',
						tooltip: 'Index of the video input you want to trigger (1-based. Supports variable)',
						regex: Regex.NUMBER,
					},
					{
						type: 'textinput',
						label: 'Video Input Name',
						id: 'videoInputName',
						tooltip: 'Name of the video input you want to trigger (Case Sensitive)',
					},
				],
				callback: async (action, context) => {
					// Picking a var from the dropdown seems to add a space on end (use trim() to ensure field is a just a clean variable)
					const videoInputIndex = await context.parseVariablesInString(String(action.options.videoInputIndex).trim())

					const nwCmd = {
						endpointPath: '/trigger/video_input',
						data: {
							id: {
								index:
									videoInputIndex !== 'undefined' && videoInputIndex !== undefined && parseInt(videoInputIndex) > 0
										? Number(videoInputIndex) - 1
										: null,
								name:
									action.options.videoInputName !== undefined && String(action.options.videoInputName).length > 0
										? action.options.videoInputName
										: null,
							},
						},
					}
					await sendNwCommand(nwCmd)
				},
			},
			[ActionId.newRandomNumber]: {
				name: 'New Random Number',
				options: [
					{
						type: 'textinput',
						label: 'New Random Number Between 1 And:',
						id: 'randomLimit',
						default: '10',
						tooltip:
							'Updates the module variable current_random_number with a new random number up to the limit your enter. (Supports variable)',
						regex: Regex.NUMBER,
					},
				],
				callback: async (action, context) => {
					// Picking a var from the dropdown seems to add a space on end (use trim() to ensure field is a just a clean variable)
					const randomLimit = await context.parseVariablesInString(String(action.options.randomLimit).trim())

					this.updateVariable('current_random_number', Math.floor(Math.random() * parseInt(randomLimit)) + 1)
				},
			},
			[ActionId.nwCustom]: {
				name: 'Custom Action (Network Link - Support Use Only)',
				options: [
					{
						type: 'textinput',
						label: 'Endpoint Path',
						id: 'endpointPath',
						tooltip: 'REST Endpoint path (must start with /)',
					},
					{
						type: 'textinput',
						label: 'JSON Data',
						id: 'jsonData',
						tooltip: 'JSON Data (no single quotes, no trailing commas)',
					},
				],
				callback: async (action) => {
					const nwCmd = {
						endpointPath: action.options.endpointPath,
						data: JSON.parse(String(action.options.jsonData)),
					}
					await sendNwCommand(nwCmd)
				},
			},
			[ActionId.customAction]: {
				name: 'Custom Action (Support Use Only)',
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
				callback: async (action) => {
					let cmd
					try {
						cmd = JSON.parse(String(action.options.customAction))
					} catch (err) {
						this.instance.log(
							'debug',
							'Failed to convert custom action: ' + action.options.customAction + ' to valid JS object: ' + err.message
						)
						return
					}
					await sendCommand(cmd)
				},
			},
		}
		return actions
	},
	ActionId: ActionId,
}
