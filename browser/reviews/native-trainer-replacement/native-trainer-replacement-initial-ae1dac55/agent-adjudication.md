# Initial replacement review adjudication

Actual Opus found no implementation defect, but THREE accepted test gaps. G1: the intended power1/Stage1-score carry case used Fighting Seismic Toss vsNormal and exited Stage1, so it did not test that claim. G2: the neutral native type port did not log/compare all move/type/score tuples, so candidate dynamic override and call-order regressions were not detected. G3: chargeMoveHit was correlated with gravity in flags fixtures. These are accepted, not dismissed; a corrected test snapshot and narrow actual follow-up will close them before commit. Initial9/9 test pass is preserved but is not final proof for those paths.

Source additionally confirms singles partner aliases the same battler, not an inactive slot: runtime defaults6 are exclusion-equivalent, but the API comment and neutral C harness identity deserve correction/qualification. C neutral damage ports and shared imported moves/items do not prove full native damage or import correctness. Synthetic controller/type controls are not encounter claims; actual Bugsy metadata is separately checked.

All221 provided files remain hash-identical/no extras; actual Opus39turns324498ms/no errors or denials. Reviewer did not run tests or compute hashes. No broad engine approval is implied.
