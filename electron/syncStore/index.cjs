// Where the sync between the church's computers keeps what it shares
// (docs/desktop-architecture.md §8b): one interface for the engine
// (electron/sync.cjs) and the pairing (electron/syncPairing.cjs), built for
// Google Drive's rules rather than a file system's:
//
//   - an object is a name and its bytes; a name is NOT unique (two objects
//     may share one, and readers must cope);
//   - nothing is ever appended or renamed: an object is written whole, once
//     (putNew), or replaced whole (putWhole, one object a computer owns);
//   - a listing may lag a write (an object made a moment ago may not be
//     listed yet, one removed may still be), while read(id) of a listed
//     object is what is there now, or null when it is gone;
//   - any call may fail (offline, a quota, a busy file): the engine keeps
//     what it has not done for the next pass.
//
// The names the engine uses (adapters map them to what they hold):
//
//   keryx-sync.json            the church's code file (syncPairing.cjs)
//   changes/<pc>/<seq>.jsonl   one computer's changes of one pass, never
//                              touched again; <seq> six digits or more
//   computers/<pc>.json        who that computer is (computer.json)
//   state/<pc>.json            what it has read and the media it uses
//   media/<file>               a media file, by its uuid name
//
// An adapter is an object with:
//
//   kind                       "drive"
//   where                      what the status shows (the account)
//   key                        what the engine's read state belongs to:
//                              another key starts the reading over
//   available()                -> Promise<bool>: reachable now (Drive
//                              answers)
//   list(prefix, { quick })    -> Promise<[{ id, name, size, created,
//                              modified, props }]>, every object whose name
//                              starts with prefix (created/modified in ms);
//                              with quick, an adapter for which they cost a
//                              call per object may leave size, created and
//                              modified null
//   stat(id)                   -> Promise<{ size, created, modified } | null>
//   read(id)                   -> Promise<Buffer | null>: the whole object,
//                              null when it is gone
//   putNew(name, bytes, props) -> Promise<object>: a new object, never over
//                              another (props: a few short strings, which
//                              Drive keeps as appProperties)
//   putWhole(name, bytes)      -> Promise<object>: the object of that name
//                              replaced whole (made when there is none); a
//                              reader sees the old bytes or the new ones
//   putIfAbsent(name, bytes)   -> Promise<bool>: made only where there was
//                              none; with two at once the first made wins
//                              and the other answers false (firstWins)
//   remove(id)                 -> Promise<void>, nothing when already gone
//   upload(name, fromFile)     -> Promise<object | null>: a local file as a
//                              new object (null: the store already has it);
//                              an interrupted upload may go on where it was
//   download(id, toFile)       -> Promise<void>: the object's bytes into a
//                              local file, which may hold the start of them
//                              from an interrupted download (go on from
//                              there when the adapter can tell it is the
//                              same object)
//
// Adapters: `drive` (drive.cjs), Google Drive's REST API in the account's
// appDataFolder ("Google Drive direto", PR 2); `fakeDrive` (fakeDrive.cjs),
// in memory, enforcing the rules above, for the tests. The shared folder of
// before (Google Drive para computador, `folder.cjs`) went in PR 4.

const { createDriveStore } = require("./drive.cjs");
const { createFakeDrive } = require("./fakeDrive.cjs");
const rules = require("./rules.cjs");

module.exports = { createDriveStore, createFakeDrive, ...rules };
