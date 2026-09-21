import { describe, expect, it } from 'vitest';
import { hydrateLocalValues, planSectionSave } from '../utils/configHydration';

describe('hydrateLocalValues', () => {
  it('shows server values that arrive after an empty first pass (regression B53)', () => {
    // First render: nothing loaded yet → nothing to hydrate.
    let values = hydrateLocalValues({}, {}, new Set());
    expect(values).toEqual({});
    // Queries resolve one by one; untouched keys must take the server value.
    values = hydrateLocalValues(values, { 'smtp.host': 'smtp.example.com' }, new Set());
    values = hydrateLocalValues(values, { 'smtp.port': '587', 'smtp.pass': 'secret' }, new Set());
    expect(values).toEqual({ 'smtp.host': 'smtp.example.com', 'smtp.port': '587', 'smtp.pass': 'secret' });
  });

  it('keeps local edits on touched keys across a refetch', () => {
    const touched = new Set(['smtp.host']);
    const values = hydrateLocalValues(
      { 'smtp.host': 'typing…', 'smtp.port': '25' },
      { 'smtp.host': 'smtp.example.com', 'smtp.port': '587' },
      touched,
    );
    expect(values).toEqual({ 'smtp.host': 'typing…', 'smtp.port': '587' });
  });
});

describe('planSectionSave', () => {
  const keys = ['smtp.host', 'smtp.port', 'smtp.pass'];

  it('never deletes a key whose server value has not loaded', () => {
    const plan = planSectionSave(keys, {}, { 'smtp.host': 'smtp.example.com' }, new Set());
    expect(plan).toEqual({ upsert: [], remove: [] });
  });

  it('upserts changed values and deletes blanked ones', () => {
    const plan = planSectionSave(
      keys,
      { 'smtp.host': 'new.example.com', 'smtp.port': '', 'smtp.pass': 'x' },
      { 'smtp.host': 'smtp.example.com', 'smtp.port': '587', 'smtp.pass': 'x' },
      new Set(keys),
    );
    expect(plan.upsert).toEqual([{ key: 'smtp.host', value: 'new.example.com' }]);
    expect(plan.remove).toEqual(['smtp.port']);
  });
});
