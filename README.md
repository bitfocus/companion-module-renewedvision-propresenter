# Companion Module for Renewed Vision's [ProPresenter](https://renewedvision.com/propresenter/)

See [HELP.md](https://github.com/greyshirtguy/companion-module-renewedvision-propresenter/blob/master/HELP.md) for instructions

## ⚠️ Reporting An Issue:
All issues/bugs are reported in tracked in the [Issues List](https://github.com/bitfocus/companion-module-renewedvision-propresenter/issues) on the Github repo.
- First, read the "Change Log" below to see if any new (Beta Builds) have been released after the version you are currently running that addresses your issue.
- If you cannot see your issue as a fix in a later version the click the link to visit the [Issues List](https://github.com/bitfocus/companion-module-renewedvision-propresenter/issues)
- Read through all the current open Issues to see if your issue is already reported - If so, feel free to add more information to the existing issue - otherwise...
- Create a new issue and please include lots of information with screenshots and instructions/steps for how to reproduce the issue.
Please make sure to include the debug log at the time of the issue and version details for Companion, ProPresenter and your Operating System.

<br><br>

## 📝 Change Log:
### v2.5.0 (Beta Build TBA)
- Added this README.md
- (New) Updated config UI to make more user friendly.
- (New) Added config option to poll Looks to enable feedback of active look from Pro 7 on Windows - (Feedback already works for Pro7 on Mac without polling)
- (New) New action "Specific Slide With Label" - Trigger a slide by specifiying the playlist name, presentation name and the custom slide label that has been applied to the slide. Matches first playlist, presentation and slide label found. Finally you can trigger a slide in a presentation - no matter where it is moved to! (Also works with variables)
- (New) Added feedback for active Look
- (New) New action "Specific Slide In A Group" - Trigger a slide in a specified group name by index (eg 1st slide of "Chorus", 1st slide of "Bridge"). Can target the current presentation or a even specific presentation using a presentationPath. (Also works with variables!)
- (New) Added option for using either Name OR Index with many of the new Network link actions. If you you supply both an index and a name, the index will be used.
- (Update) Removed "- beta" label from Network link actions.
- (Bugfix) Minor bugfix with integer action parameters


### v2.4.6 (Beta Build 3804)
- (New) Module variables to correctly track presentations that target announcement layer: 'Current Announcement slide number' & 'Current Announcement Presentation Path'
- (New) Config option to configure "Manual" Type of Presentation Info Requests that Pro7/Windows users can turn on to avoid performance issues when the option to "Send Presentation Info Requests To ProPresenter" is enabled.
- (New/Bugfix) New config option to configure "Manual" Type of Presentation Info Requests that Pro7/Windows users can turn on to avoid performance issues when the option to "Send Presentation Info Requests To ProPresenter" is enabled.
- (Bugfix) Incorrect values for current presentation path/slide/remaining slide when an annoucement presentation was running in background.
- (Bugfix) Pro6/Windows failed to update vars for (watched/all) clock

### v2.4.5 (Beta Build 3803)
- (New) Added new variable for clock total seconds: 'pro7_clock_n_totalseconds' (where n = clock index) _This is good for feedback - eg change colour when countdown timer value is <0_
- (New) Allow + or - prefix to increment/decrement clockTimes (based on current value) in Update Clock action.
- (Bugfix) Fixed bug with hourless clock variables (was dropping negative sign for negative times)

### v2.4.4 (Beta Build 3791)
- (Bugfix) Minor bugfix for two new beta actions (Clear Prop, Clear Message)

### v2.4.3 (Beta Build 3785)
- (New) You can now use module or custom variables in the Message TokenValues Field in a send Message action
- (Bugfix) Fixed major bug in 2.4.2 where previous NetworkLink actions were being re-sent with subsquent normal actions (and visa-versa)

### v2.4.2 (Beta Build 3766)
- (New) Allow hostname in config for ProPresenter
- (New) Add module var "current_presentation_path"
- (New) Full support for dynamically added module vars for all stage screens and clocks (now show in Ui and can be used in triggers etc).
- (New) Allow variables to be used in the "Specific Slide" action paremeters - This comes in handy if you store current_slide and current_present_path in custom vars and later use those custom vars as paremeters to recall the stored slide
- (New) Add follwing BETA actions using new Network Link API: 
    - Specific Slide (Network Link - Beta) - Trigger and slide by name
    - Prop Trigger (Network Link - Beta) - Trigger any Prop by name
    - Prop Clear (Network Link - Beta) - Clear any specific Prop by name
    - Message Clear (Network Link - Beta) - Clear any specifc Message by name
    - Trigger Media (Network Link - Beta) - Trigger any Media by name
    - Trigger Audio (Network Link - Beta) - Trigger any Audio by name
    - Trigger Video Input (Network Link - Beta) - Trigger any Video Input by name
    - Custom Action (Network Link - Beta) - Send custom JSON to custom Endpoint Path
- (Bugfix) Fixed issue with follower beta feature not properly tracking when disconnected and causing issues.

### v2.4.1 (Beta Build 3693)
- (New) This version dynamically adds vars for all timers/clocks:
    - $(propresenter:pro7_clock_n) = hh:mm:ss for clock with index n
    - $(propresenter:pro7_clock_n_hourless) = mm:ss for clock with index n
    - (Still keeping old single var $(propresenter:watched_clock_current_time) for backwards compatibility in users setups)

### v2.4.0 (Beta Build ????)
- (New) Pro7.6+ supports triggering macros and setting looks via the remote protocol. Added actions for triggering Looks/Macros!
- (New) Added module var for current_pro7_look_name

### v2.3.7 (Companion 2.1.4 Release Build)
- (New) Added a customAction - where you can type JSON message to send to ProPresenter (allows user to create new action before this mofule is updated - advanced use only - as ProPresenter is easy to crash with invalid messsages!)
- (Bugfix) Pro7.4.2 requires changes to API. Version must be at least 701 - or else connection is refused. Also: "presenationTriggerNext" (and Previous) must now include presentationDestination (which works fine with older versions of ProPresenter)

### v2.3.6 (Beta Build ????)
- (New) Leader-Follower beta config option to mimic Pro6 Master-Slave setup. 







