// How the smoke reads the checks a computer in use can spoil. Windows gives
// the foreground only to the program the user is in, and the level meters
// hear every sound of the computer: those cases are inconclusive (a string,
// which still passes), never a failure. What KERYX itself got wrong fails.
const OTHER_IN_FRONT = "outro programa na frente";
const OTHER_PLAYING = "outro programa tocando";

// focused: the KERYX window with the focus (null: another program has it).
// expected: the window that should have it.
function focusVerdict(focused, expected) {
    if (!expected || focused === expected) return true;
    if (!focused) return OTHER_IN_FRONT;
    return false;
}

// dropped: the meters fell after the mute. keryxAudible: KERYX windows still
// playing sound once Chromium settles.
function meterVerdict(dropped, keryxAudible) {
    if (dropped) return true;
    if (!keryxAudible.length) return OTHER_PLAYING;
    return false;
}

module.exports = { focusVerdict, meterVerdict, OTHER_IN_FRONT, OTHER_PLAYING };
