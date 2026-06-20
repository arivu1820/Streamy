// Standalone verifier for the real governance.ts (run with Node 22 type-stripping).
// Not part of the app build; mirrors test/governance.spec.ts for environments
// without jest installed.
import {
  passesMajority,
  shouldDeleteVideo,
  shouldChangeVideo,
  majorityThreshold,
  buildDeleteTally,
} from './governance.ts';

let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failed++;
    console.error(`FAIL ${label}: got ${a}, expected ${e}`);
  }
}

// Spec worked examples
eq(shouldDeleteVideo(6, 11), true, '11 members, 6 delete => delete');
eq(shouldDeleteVideo(5, 10), false, '10 members, 5-5 tie => keep');
eq(shouldDeleteVideo(6, 10), true, '10 members, 6 delete => delete');
eq(majorityThreshold(11), 6, 'threshold(11)=6');
eq(majorityThreshold(10), 6, 'threshold(10)=6');

// Ties always keep
for (let m = 2; m <= 40; m += 2) {
  eq(passesMajority(m / 2, m), false, `tie@${m} keeps`);
  eq(passesMajority(m / 2 + 1, m), true, `tie+1@${m} passes`);
}

// Exhaustive 1..30
let exhaustiveOk = true;
for (let total = 1; total <= 30; total++) {
  for (let yes = 0; yes <= total; yes++) {
    const expected = yes > Math.floor(total / 2);
    if (passesMajority(yes, total) !== expected) exhaustiveOk = false;
    if (shouldDeleteVideo(yes, total) !== expected) exhaustiveOk = false;
    if (shouldChangeVideo(yes, total) !== expected) exhaustiveOk = false;
  }
}
eq(exhaustiveOk, true, 'exhaustive table 1..30');

// Degenerate
eq(passesMajority(0, 0), false, 'empty room');
eq(shouldDeleteVideo(1, 1), true, 'sole member deletes');
eq(buildDeleteTally(4, 2, 11), { deleteVotes: 4, keepVotes: 2, activeMembers: 11, needed: 6, willDelete: false }, 'tally shape');

if (failed === 0) {
  console.log('PASS: all governance assertions passed (strict-majority, tie-keeps).');
} else {
  console.error(`${failed} assertion(s) FAILED`);
  process.exit(1);
}
