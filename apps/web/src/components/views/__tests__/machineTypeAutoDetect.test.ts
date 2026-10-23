import { describe, it, expect } from 'vitest';
import { detectMachineType } from '../RegisterMachineModal';

describe('Machine Type Auto-Categorization', () => {
  it('correctly detects Bucket Elevator from keywords', () => {
    expect(detectMachineType('Industrial Bucket Elevator')).toBe('Bucket Elevator');
    expect(detectMachineType('Bucket Elevator')).toBe('Bucket Elevator');
    expect(detectMachineType('Vertical Bucket Lift Conveyor')).toBe('Bucket Elevator');
    expect(detectMachineType('Grain Bucket-Elevator Model 4')).toBe('Bucket Elevator');
  });

  it('correctly detects Centrifugal Pump from keywords', () => {
    expect(detectMachineType('Centrifugal Pump')).toBe('Centrifugal Pump');
    expect(detectMachineType('Centrifugal Slurry Bottoms Pump')).toBe('Centrifugal Pump');
    expect(detectMachineType('High Pressure Feedwater Pump')).toBe('Centrifugal Pump');
    expect(detectMachineType('Submersible Sump Pump')).toBe('Centrifugal Pump');
  });

  it('correctly detects Heat Exchanger from keywords', () => {
    expect(detectMachineType('Shell & Tube Heat Exchanger')).toBe('Shell & Tube Heat Exchanger');
    expect(detectMachineType('Shell and Tube Heat Exchanger')).toBe('Shell & Tube Heat Exchanger');
    expect(detectMachineType('Primary Condenser Reboiler')).toBe('Shell & Tube Heat Exchanger');
    expect(detectMachineType('Plate Heat Exchanger Unit')).toBe('Shell & Tube Heat Exchanger');
  });

  it('correctly detects Wet Gas Compressor from keywords', () => {
    expect(detectMachineType('Wet Gas Compressor')).toBe('Wet Gas Compressor');
    expect(detectMachineType('Reciprocating Gas Compressor')).toBe('Wet Gas Compressor');
    expect(detectMachineType('Screw Air Compressor 200HP')).toBe('Wet Gas Compressor');
  });

  it('correctly detects Emergency Isolation Valve from keywords', () => {
    expect(detectMachineType('Emergency Isolation Valve')).toBe('Emergency Isolation Valve');
    expect(detectMachineType('Main Safety Relief Valve (PSV-101)')).toBe('Emergency Isolation Valve');
    expect(detectMachineType('High Pressure Ball Valve')).toBe('Emergency Isolation Valve');
  });

  it('correctly detects Hydraulic / Electric Motor from keywords', () => {
    expect(detectMachineType('Hydraulic Motor')).toBe('Hydraulic Motor');
    expect(detectMachineType('Heavy Duty Induction Electric Motor')).toBe('Hydraulic Motor');
    expect(detectMachineType('Variable Frequency Drive Motor')).toBe('Hydraulic Motor');
  });

  it('correctly detects Fractionation Tower / Column from keywords', () => {
    expect(detectMachineType('Fractionation Tower')).toBe('Fractionation Tower');
    expect(detectMachineType('Crude Distillation Column')).toBe('Fractionation Tower');
    expect(detectMachineType('Sour Water Stripper Column')).toBe('Fractionation Tower');
  });

  it('correctly detects other industrial equipment types', () => {
    expect(detectMachineType('Belt Conveyor System')).toBe('Conveyor System');
    expect(detectMachineType('Induced Draft Fan')).toBe('Industrial Blower / Fan');
    expect(detectMachineType('High Pressure Steam Boiler')).toBe('Boiler / Pressure Vessel');
    expect(detectMachineType('Slurry Agitator Tank')).toBe('Industrial Mixer / Agitator');
  });

  it('returns null for empty or non-matching names safely', () => {
    expect(detectMachineType('')).toBeNull();
    expect(detectMachineType('   ')).toBeNull();
    expect(detectMachineType('Random Custom Equipment 9999')).toBeNull();
  });
});
