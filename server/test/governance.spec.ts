import {
  passesMajority,
  shouldDeleteVideo,
  shouldChangeVideo,
  majorityThreshold,
  buildDeleteTally,
} from '../src/common/governance';

describe('strict-majority governance rule (streamy.md FR-5.5 / FR-7.5)', () => {
  it('matches the spec worked examples', () => {
    expect(shouldDeleteVideo(6, 11)).toBe(true); // 6 > 5 => delete
    expect(shouldDeleteVideo(5, 10)).toBe(false); // 5 > 5 false => tie keeps
    expect(shouldDeleteVideo(6, 10)).toBe(true); // 6 > 5 => delete
  });

  it('a tie always keeps (even counts)', () => {
    for (let m = 2; m <= 40; m += 2) {
      const half = m / 2;
      expect(passesMajority(half, m)).toBe(false); // exact tie fails
      expect(passesMajority(half + 1, m)).toBe(true); // one over the tie passes
    }
  });

  it('exhaustive table for members 1..30', () => {
    for (let total = 1; total <= 30; total++) {
      for (let yes = 0; yes <= total; yes++) {
        const expected = yes > Math.floor(total / 2);
        expect(passesMajority(yes, total)).toBe(expected);
        expect(shouldDeleteVideo(yes, total)).toBe(expected);
        expect(shouldChangeVideo(yes, total)).toBe(expected);
      }
    }
  });

  it('threshold = floor(total/2)+1', () => {
    expect(majorityThreshold(11)).toBe(6);
    expect(majorityThreshold(10)).toBe(6);
    expect(majorityThreshold(1)).toBe(1);
    expect(majorityThreshold(2)).toBe(2);
  });

  it('degenerate inputs are safe', () => {
    expect(passesMajority(0, 0)).toBe(false);
    expect(passesMajority(5, 0)).toBe(false);
    expect(shouldDeleteVideo(1, 1)).toBe(true); // sole member can delete own-room video
  });

  it('buildDeleteTally reports needed + willDelete', () => {
    expect(buildDeleteTally(4, 2, 11)).toEqual({
      deleteVotes: 4,
      keepVotes: 2,
      activeMembers: 11,
      needed: 6,
      willDelete: false,
    });
    expect(buildDeleteTally(6, 0, 11).willDelete).toBe(true);
  });
});
