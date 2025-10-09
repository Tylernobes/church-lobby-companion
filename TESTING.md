# Church Lobby Companion Integration Testing Guide

## 🚀 Quick Start Testing

You've implemented the integration on your Expo app side. Now let's test it step by step to ensure everything works perfectly.

## 📋 Test Scenarios

### Scenario 1: Direct Desktop App Testing

**What it tests:** Whether your desktop app can communicate with your live website.

**Steps:**

1. Open your Church Lobby Companion desktop app
2. Make sure your website loads in the iframe
3. Wait for the website to fully load (you should see your music player)
4. Look for the blue "Integration Testing" panel above the iframe
5. Click **"Test Integration"**

   - ✅ Expected: Should show "Integration found! Methods: play, pause, stop, fadeIn, fadeOut, getStatus"
   - ❌ If failed: Your Expo app integration isn't loaded yet

6. Test the controls:
   - Click **"📈 Test Fade In"** - Should start playing and fade in over 3 seconds
   - Click **"📉 Test Fade Out"** - Should fade out and pause after 3 seconds
   - Click **"⏹️ Test Stop"** - Should immediately stop/pause

### Scenario 2: MIDI Mapping Testing

**What it tests:** Whether MIDI commands trigger the audio controls.

**Steps:**

1. Make sure a MIDI device is connected and selected
2. Create a mapping:
   - Click **"📈 Map Fade In"**
   - Press a key/button on your MIDI controller
   - Set fade duration (e.g., 5 seconds)
   - Click **"✅ Confirm & Save"**
3. Test the mapping:
   - Press the same MIDI key/button
   - Your website audio should fade in over the duration you set
4. Repeat for Fade Out and Stop mappings

### Scenario 3: Browser Console Testing

**What it tests:** Direct integration without MIDI hardware.

**Steps:**

1. Open your website (https://churchlobbymusic.net) in a separate browser tab
2. Open browser Developer Tools (F12)
3. Go to the Console tab
4. Type these commands one by one:

```javascript
// Check if integration exists
window.churchLobbyPlayer;

// Test direct commands
window.churchLobbyPlayer.fadeIn(3);
window.churchLobbyPlayer.fadeOut(2);
window.churchLobbyPlayer.stop();

// Test event-based commands (simulating MIDI)
document.dispatchEvent(
  new CustomEvent("churchLobbyCommand", {
    detail: { type: "fadeIn", seconds: 5 },
  })
);
```

### Scenario 4: Standalone Test Page

**What it tests:** Integration in isolation with detailed debugging.

**Steps:**

1. Open the test page in your browser:
   - If running locally: `file:///path/to/church-lobby-companion/test-page.html`
   - Or serve it with a local server
2. Wait for the iframe to load your website
3. Click **"Check Integration"** - Should show success
4. Try the manual controls (Fade In, Fade Out, Stop)
5. Try the MIDI simulation buttons
6. Watch the console output for detailed logs

## 🔍 Troubleshooting

### Issue: "Integration not found"

**Possible causes:**

- Your Expo app hasn't loaded the integration hook yet
- The `useChurchLobbyIntegration` hook isn't running
- MiniPlayer context isn't available

**Solutions:**

1. Wait longer for the page to load completely
2. Check browser console for errors
3. Verify your Expo app is running the latest code with the integration

### Issue: "Functions not available"

**Possible causes:**

- MiniPlayer functions aren't being exposed correctly
- Context provider isn't wrapping the component properly

**Solutions:**

1. Check that `_layout.tsx` properly wraps components with MiniPlayer context
2. Verify `useChurchLobbyIntegration.ts` is correctly accessing player functions
3. Check browser console for error messages

### Issue: MIDI commands not working

**Possible causes:**

- MIDI device not properly connected
- Mappings not saved correctly
- Backend MIDI processing issues

**Solutions:**

1. Check MIDI device connection in the desktop app
2. Verify mappings are saved and visible in the UI
3. Look at the "Live MIDI" indicator - it should show incoming messages
4. Test with the browser console method first

### Issue: Audio doesn't respond

**Possible causes:**

- Website audio player not ready
- Audio permissions not granted
- Volume/mute settings

**Solutions:**

1. Make sure audio is playing manually first
2. Check browser audio permissions
3. Verify volume settings on both browser and system
4. Try with a simple test audio file

## 📊 Expected Console Messages

When everything is working, you should see these messages in the browser console:

```
Church Lobby Companion integration is ready!
Received Church Lobby command: fadeIn
Executing fade in...
Integration Test: ✅ Integration found! Methods: play,pause,stop,fadeIn,fadeOut,getStatus
```

## 🎯 Next Steps After Testing

Once testing confirms everything works:

1. **Production Deployment**: Deploy your Expo app changes
2. **MIDI Mapping**: Set up your preferred MIDI mappings
3. **Live Usage**: Start using it during your church services
4. **Backup Plan**: Keep the manual browser controls as backup

## 🆘 Getting Help

If tests fail:

1. **Check Console**: Always check browser developer console for errors
2. **Network Issues**: Ensure your Expo app and desktop app can communicate
3. **Version Compatibility**: Make sure you're using compatible versions
4. **Code Review**: Double-check the integration hook implementation

## 🧪 Advanced Testing

For advanced users, you can:

1. **Load the test script directly**: Load `/test-integration.js` in your website console
2. **Custom test commands**: Create your own test scenarios
3. **Automated testing**: Set up automated browser tests with Playwright or Selenium
4. **Performance monitoring**: Check integration response times and reliability

---

## 🎉 Success Criteria

Your integration is working perfectly when:

- ✅ Desktop app test buttons all work
- ✅ MIDI keys trigger audio controls
- ✅ Browser console commands work
- ✅ No errors in browser console
- ✅ Audio fades smoothly over the specified duration
- ✅ Integration status shows "ready"

Start with **Scenario 1** (Desktop App Testing) - it's the easiest way to verify everything is connected properly!
