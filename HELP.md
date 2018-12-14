# companion-module-propresenter6

Module for using ProPresenter with the Elgato Stream Deck and Companion

# Commands
## Slides
Command | Description
------- | -----------
Next Slide | Advances to the next slide in the current document. If at the end of a document, will advance to the start of the next document in the playlist.
Previous Slide | Moves to the previous slide in the current document. If at the start of a document, will move to the start of the previous document in the playlist.
Specific Slide | Moves to that presentation/slide number. See the `Specific Slide` section below.

### Specific Slide
This action has two parameters:

**Slide Number**: Moves to the slide number specified.

A whole number greater than 0 will move the presentation to that slide number.

A slide number of `0` will trigger the current slide, which can be used to bring back a slide that was cleared using `Clear All` or `Clear Slide`.

A relative number (prefixed with `+` or `-`) will move the presentation +/- that many slides. `+3` will jump ahead three slides, and `-2` will jump back two slides. Try to avoid using `-1` or `+1` relative numbers; use the `Next Slide` and `Previous Slide` actions instead, as they perform better. 


**Presentation Path**: Lets you trigger a slide in a different presentation, even from a different playlist.

*Important: Presentation path numbering starts at 0, meaning `0` will trigger a slide in the first presentation in the playlist.*

A single number, like `3`, will let you trigger a slide in the *fourth* presentation in the **current playlist**. 

A path like `1:3` will trigger presentation #4 in playlist #2.

Playlists in groups (or nested groups) are identified using periods. `1.1.0:2` means "The second playlist is a group. The second item in that group is another group. Select the first playlist in that group. Choose the third presentation in the playlist."

The below image may make this more clear:

![specific-slide](documentation/images/specific-slide.png)



## Clear/Logo
Command | Description
------- | -----------
Clear All | Clears all the layers
Clear Audio | Clears the audio track
Clear Background | Clears only the background layer
Clear Slide | Clears the current slide (foreground and background)
Clear Telestrator | Clears all annotations drawn with the telestrator
Clear to Logo | Clears all the layers and shows the logo image set in ProPresenter

### Clear All
Note: When the `Clear All` action is triggered against ProPresenter for Windows, the current slide will be lost but on Mac it's preserved.

For example, if you're on slide #5, trigger `Clear All`, and then trigger `Next Slide`:
- On Mac you'll be on slide #6
- On Windows, you'll be on slide #1

You can work around this PC limitation by using the `Specific Slide` action with a relative slide number of `+1` to move to the next slide. This would move you to slide #6 after the `Clear All` action.


## Stage Display
Command | Description
------- | -----------
Stage Display Message | Shows the message on the stage display output
Stage Display Hide Message | Removes the stage display message
Stage Display Layout | Sets the stage display layout. Index is a 0-based number (in the order shown in ProPresenter)


# Dynamic Variables
Variable | Description
-------- | -----------
$(propresenter:current_slide) | The number of the active slide (>= 1), or "N/A" if unknown.
$(propresenter:total_slides)  | The total number of slides in the current document, or "N/A" if unknown.
$(propresenter:presentation_name) | The name of the current presentation, or "N/A" if unknown.
$(propresenter:connection_status) | The current connection status to ProPresenter ("Disconnected" or "Connected").
