CHARACTER ANIMATION ASSETS

Each character has one folder per animation.
frame_00.png through frame_05.png are sequential transparent PNG frames.
spritesheet.png is a horizontal strip of the same six frames.
manifest.json records the actual frame dimensions and suggested FPS.
Use nearest-neighbor filtering; avoid smooth resizing.

Animations are extracted from generated sheets, not hand-authored final animation.
Some lateral attack frames change facing; some weapons vary between frames.
Grid extraction preserves original frame positions but does not correct pose continuity.
Review pivots, cropping, scale and directional consistency in the game editor.
Ranger includes hurt and death. Other characters currently include walk and attack only.
Bat and spider animation sheets have not been created yet.
