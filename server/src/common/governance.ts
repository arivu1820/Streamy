/**
 * Pure governance rules for Streamy. These are deliberately dependency-free so
 * they can be unit-tested exhaustively (streamy.md Sections 12, 14, 41).
 *
 * THE RULE (strict majority, tie keeps):
 *   deletion / change trips iff   yesVotes > floor(total / 2)
 */

export function majorityThreshold(total: number): number {
  // Minimum number of YES votes required to pass: floor(total/2) + 1.
  if (total <= 0) return 1;
  return Math.floor(total / 2) + 1;
}

/** Strict majority: yes > floor(total/2). A tie or anything at/below half fails. */
export function passesMajority(yesVotes: number, total: number): boolean {
  if (total <= 0) return false;
  return yesVotes > Math.floor(total / 2);
}

/** Video deletion decision (streamy.md FR-5.5). */
export function shouldDeleteVideo(deleteVotes: number, activeMembers: number): boolean {
  return passesMajority(deleteVotes, activeMembers);
}

/** Change-now-playing-video decision among current session participants (FR-7.5). */
export function shouldChangeVideo(approvals: number, participants: number): boolean {
  return passesMajority(approvals, participants);
}

export interface VoteTally {
  deleteVotes: number;
  keepVotes: number;
  activeMembers: number;
  needed: number; // votes required to delete
  willDelete: boolean;
}

export function buildDeleteTally(deleteVotes: number, keepVotes: number, activeMembers: number): VoteTally {
  return {
    deleteVotes,
    keepVotes,
    activeMembers,
    needed: majorityThreshold(activeMembers),
    willDelete: shouldDeleteVideo(deleteVotes, activeMembers),
  };
}
