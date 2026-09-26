import { describe, it, expect } from 'vitest';
import { hasUnsavedPickChanges } from '../picks';
import type { Pick } from '../../types';

const saved: Pick[] = [1, 2, 3, 4, 5].map(n => ({
  userId: 'u1',
  weekId: 'week-2026-10-03',
  gameId: `g${n}`,
  selectedTeamId: 'BOS',
  confidence: n,
  pointsEarned: 0,
  result: 'PENDING'
}));

describe('hasUnsavedPickChanges', () => {
  it('is clean when nothing has been picked or saved', () => {
    expect(hasUnsavedPickChanges([], [])).toBe(false);
  });

  it('is clean right after a save, whatever order the database returns', () => {
    expect(hasUnsavedPickChanges([...saved].reverse(), saved)).toBe(false);
  });

  it('ignores scoring fields the working copy does not carry', () => {
    const working = saved.map(({ gameId, selectedTeamId, confidence }) => ({
      gameId,
      selectedTeamId,
      confidence
    }));
    expect(hasUnsavedPickChanges(working, saved)).toBe(false);
  });

  it('is dirty when a team changes', () => {
    const working = saved.map(p => (p.gameId === 'g3' ? { ...p, selectedTeamId: 'TOR' } : p));
    expect(hasUnsavedPickChanges(working, saved)).toBe(true);
  });

  it('is dirty when confidences are swapped', () => {
    const working = saved.map(p =>
      p.gameId === 'g1' ? { ...p, confidence: 2 } : p.gameId === 'g2' ? { ...p, confidence: 1 } : p
    );
    expect(hasUnsavedPickChanges(working, saved)).toBe(true);
  });

  it('is dirty when a pick is swapped for a different game', () => {
    const working = [...saved.slice(0, 4), { gameId: 'g6', selectedTeamId: 'BOS', confidence: 5 }];
    expect(hasUnsavedPickChanges(working, saved)).toBe(true);
  });

  it('is dirty when a pick is dropped', () => {
    expect(hasUnsavedPickChanges(saved.slice(0, 4), saved)).toBe(true);
  });

  it('is clean again once an edit is undone', () => {
    const edited = saved.map(p => (p.gameId === 'g3' ? { ...p, selectedTeamId: 'TOR' } : p));
    const undone = edited.map(p => (p.gameId === 'g3' ? { ...p, selectedTeamId: 'BOS' } : p));
    expect(hasUnsavedPickChanges(undone, saved)).toBe(false);
  });

  it('is dirty for a first sheet that has never been saved', () => {
    expect(hasUnsavedPickChanges(saved, [])).toBe(true);
  });
});
