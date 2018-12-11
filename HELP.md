# companion-module-propresenter6

Module for using ProPresenter with the Elgato Stream Deck and Companion

# Commands
## Slides
Command | Description
------- | -----------
Next Slide | Advances to the next slide in the current document. If at the end of a document, will advance to the start of the next document in the playlist.
Previous Slide | Moves to the previous slide in the current document. If at the start of a document, will move to the start of the previous document in the playlist.
Jump to Slide | Moves to the slide number

## Clear/Logo
Command | Description
------- | -----------
Clear All | Clears all the layers
Clear Audio | Clears the audio track
Clear Background | Clears only the background layer
Clear Slide | Clears the current slide (foreground and background)
Clear Telestrator | Clears all annotations drawn with the telestrator
Clear to Logo | Clears all the layers and shows the logo image set in ProPresenter

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


----


FOR BEST PERFORMANCE ADD DOCUMENT TO PLAYLIST (propresenter like to dump loads of info down the connection if you use it directly from the library)
