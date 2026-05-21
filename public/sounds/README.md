# Alert sounds

The app tries these files in order (WAV first, then MP3):

1. `/sounds/mixkit-bell-notification-933.wav`
2. `/sounds/alert.wav`
3. `/sounds/alert.mp3`

Sound plays when:

- Sound alerts are enabled in Settings, and
- A new alert with channel `sound` is triggered.

The sound loops for **30 seconds**, then stops automatically.

You can replace `alert.wav` / `alert.mp3` or keep the bundled `mixkit-bell-notification-933.wav`.
