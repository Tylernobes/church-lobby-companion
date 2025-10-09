// Integration Testing Script for Church Lobby Companion
// This script helps test the connection between your desktop app and Expo web player

console.log("🚀 Church Lobby Companion Integration Test");

// Test 1: Check if the integration is loaded
function testIntegrationExists() {
  console.log("\n📋 Test 1: Checking if Church Lobby integration exists...");

  if (typeof window.churchLobbyPlayer !== "undefined") {
    console.log("✅ window.churchLobbyPlayer is available");
    console.log("Available methods:", Object.keys(window.churchLobbyPlayer));
    return true;
  } else {
    console.log("❌ window.churchLobbyPlayer not found");
    console.log(
      "💡 Make sure your Expo app has loaded and the hook is running"
    );
    return false;
  }
}

// Test 2: Check if the command listener is working
function testCommandListener() {
  console.log("\n📋 Test 2: Testing command listener...");

  try {
    // Dispatch a test command
    const testEvent = new CustomEvent("churchLobbyCommand", {
      detail: { type: "fadeIn", seconds: 2 },
    });

    document.dispatchEvent(testEvent);
    console.log("✅ Test command dispatched successfully");
    console.log(
      "👀 Check the browser console for 'Received Church Lobby command' message"
    );
    return true;
  } catch (error) {
    console.log("❌ Failed to dispatch test command:", error);
    return false;
  }
}

// Test 3: Test direct function calls
function testDirectCalls() {
  console.log("\n📋 Test 3: Testing direct function calls...");

  if (typeof window.churchLobbyPlayer === "undefined") {
    console.log("❌ Cannot test - churchLobbyPlayer not available");
    return false;
  }

  const player = window.churchLobbyPlayer;
  let passed = 0;

  // Test each function exists
  const expectedFunctions = [
    "play",
    "pause",
    "stop",
    "fadeIn",
    "fadeOut",
    "getStatus",
  ];

  expectedFunctions.forEach((funcName) => {
    if (typeof player[funcName] === "function") {
      console.log(`✅ ${funcName}() function exists`);
      passed++;
    } else {
      console.log(`❌ ${funcName}() function missing`);
    }
  });

  console.log(
    `\n📊 Direct calls test: ${passed}/${expectedFunctions.length} functions available`
  );
  return passed === expectedFunctions.length;
}

// Test 4: Test actual playback (be careful with audio!)
async function testPlayback() {
  console.log("\n📋 Test 4: Testing actual playback...");
  console.log(
    "⚠️  This will attempt to play audio - make sure volume is reasonable!"
  );

  if (typeof window.churchLobbyPlayer === "undefined") {
    console.log("❌ Cannot test - churchLobbyPlayer not available");
    return false;
  }

  const player = window.churchLobbyPlayer;

  try {
    // Get initial status
    const initialStatus = await player.getStatus();
    console.log("📊 Initial status:", initialStatus);

    // Test fade in (short duration for testing)
    console.log("🎵 Testing fadeIn...");
    await player.fadeIn(1); // 1 second fade

    await new Promise((resolve) => setTimeout(resolve, 1500)); // Wait 1.5 seconds

    // Test fade out
    console.log("🔇 Testing fadeOut...");
    await player.fadeOut(1); // 1 second fade

    await new Promise((resolve) => setTimeout(resolve, 1500)); // Wait 1.5 seconds

    console.log("✅ Playback test completed successfully");
    return true;
  } catch (error) {
    console.log("❌ Playback test failed:", error);
    return false;
  }
}

// Test 5: Test MIDI command simulation
function testMidiCommands() {
  console.log("\n📋 Test 5: Simulating MIDI commands...");

  const commands = [
    { type: "fadeIn", seconds: 3 },
    { type: "fadeOut", seconds: 2 },
    { type: "stop" },
  ];

  commands.forEach((command, index) => {
    setTimeout(() => {
      console.log(`🎹 Simulating MIDI command ${index + 1}: ${command.type}`);

      const event = new CustomEvent("churchLobbyCommand", {
        detail: command,
      });

      document.dispatchEvent(event);
    }, index * 1000); // Stagger commands by 1 second
  });

  console.log("✅ MIDI command simulation started");
  console.log("👀 Watch for command responses in the console");
  return true;
}

// Test 6: Integration status check
function testIntegrationStatus() {
  console.log("\n📋 Test 6: Checking integration status...");

  if (typeof window.churchLobbyPlayer === "undefined") {
    console.log("❌ Cannot check status - churchLobbyPlayer not available");
    return false;
  }

  try {
    window.churchLobbyPlayer
      .getStatus()
      .then((status) => {
        console.log("📊 Current integration status:", status);
        console.log("✅ Status check completed");
      })
      .catch((error) => {
        console.log("❌ Failed to get status:", error);
      });

    return true;
  } catch (error) {
    console.log("❌ Status check failed:", error);
    return false;
  }
}

// Run all tests
async function runAllTests() {
  console.log("🧪 Running Church Lobby Companion Integration Tests\n");
  console.log("=".repeat(60));

  const results = {};

  // Basic tests
  results.integration = testIntegrationExists();
  results.commands = testCommandListener();
  results.functions = testDirectCalls();
  results.status = testIntegrationStatus();

  // Interactive tests
  console.log("\n" + "=".repeat(60));
  console.log("🎮 Interactive Tests");
  console.log("=".repeat(60));

  if (results.integration) {
    // Ask user if they want to test audio
    const testAudio = confirm(
      "Do you want to test actual audio playback? (Make sure your volume is at a reasonable level!)"
    );

    if (testAudio) {
      results.playback = await testPlayback();
    } else {
      console.log("⏭️  Skipping audio playback test");
      results.playback = null;
    }

    // MIDI simulation
    const testMidi = confirm("Do you want to simulate MIDI commands?");
    if (testMidi) {
      results.midi = testMidiCommands();
    } else {
      console.log("⏭️  Skipping MIDI simulation");
      results.midi = null;
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 TEST RESULTS SUMMARY");
  console.log("=".repeat(60));

  Object.entries(results).forEach(([test, result]) => {
    const status =
      result === true
        ? "✅ PASS"
        : result === false
        ? "❌ FAIL"
        : "⏭️  SKIPPED";
    console.log(`${test.padEnd(15)}: ${status}`);
  });

  const passed = Object.values(results).filter((r) => r === true).length;
  const total = Object.values(results).filter((r) => r !== null).length;

  console.log(`\n🏆 Overall: ${passed}/${total} tests passed`);

  if (passed === total) {
    console.log("🎉 All tests passed! Your integration is working perfectly!");
  } else {
    console.log(
      "⚠️  Some tests failed. Check the console output above for details."
    );
  }
}

// Auto-run tests when script loads
runAllTests();

// Export individual test functions for manual testing
window.churchLobbyTests = {
  runAll: runAllTests,
  testIntegration: testIntegrationExists,
  testCommands: testCommandListener,
  testFunctions: testDirectCalls,
  testPlayback: testPlayback,
  testMidi: testMidiCommands,
  testStatus: testIntegrationStatus,
};

console.log("\n💡 You can also run individual tests manually:");
console.log("window.churchLobbyTests.testIntegration()");
console.log("window.churchLobbyTests.testCommands()");
console.log("window.churchLobbyTests.testPlayback()");
console.log("etc...");
