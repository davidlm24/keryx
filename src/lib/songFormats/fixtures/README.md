# Song format fixtures

Real files the parsers are tested on (`../*.test.mjs`). Rule (owner,
2026-10-20): no song-format parser ships without a real export file here.

| File | Format | Source |
| --- | --- | --- |
| `simple.xml`, `complex.xml`, `version0.9.xml`, `test0.8-convert.xml` | OpenLyrics 0.8 / 0.9 | the spec's examples, github.com/openlyrics/openlyrics `examples/` |
| `Amazing Grace.xml` | OpenLyrics 0.9 with chords | the spec's sample songs, github.com/openlyrics/openlyrics `songs/` |

The OpenLyrics samples are public-domain hymn texts. Holyrics, EasyWorship
and ProPresenter files wait for exports the church makes of its own songs.
