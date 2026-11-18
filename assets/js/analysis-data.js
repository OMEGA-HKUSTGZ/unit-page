// Data for the Key insights section and the training-data strip, from the IJCV
// 2026 version of the paper. Tables 1, 11 and 13 are copied from the paper's tables,
// and the capability matrix from the check marks of Fig. 2.
// Fig. 12 is only given as a plot, so its group-size curve (bottom) was read from the marker
// centres of the full-resolution figure (unchanged from Fig. 10 of the arXiv
// version), calibrated on its gridlines; they are accurate to about ±0.001 m.
// Figs. 6c and 8 are also only plots: their curves were traced from the figures
// at the listed positions and show the trend, not exact values.
window.UNIT_ANALYSIS = {
  loss: {
    table: 'Table 11',
    note: '(Acc. + Comp.) / 2 on 7-Scenes, NRGBD and DTU; lower is better.',
    columns: [
      ['Offline', 'Scale-invariant'],
      ['Offline', 'Metric scale'],
      ['Online', 'Scale-invariant'],
      ['Online', 'Metric scale'],
    ],
    rows: [
      { label: 'Direct regression', values: [0.053, 0.201, 0.067, 0.433], avg: 0.188 },
      { label: 'Scale-adaptive design', values: [0.044, 0.108, 0.069, 0.147], avg: 0.092 },
      { label: '+ Shuffled normal loss', values: [0.046, 0.108, 0.07, 0.141], avg: 0.091, ours: true },
    ],
  },
  attention: {
    figure: 'Fig. 6',
    // Mean attention deviation per query frame (%), 64 streamed frames.
    x: [1, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64],
    series: {
      StreamVGGT: [0, 19.3, 18.6, 17.3, 16.6, 15.8, 14.7, 14.5, 15.3, 15.8, 15.3, 14.3, 13.5, 13.5, 13.0, 13.2, 16.2],
      UniT: [0, 7.0, 8.7, 9.2, 9.5, 9.2, 8.8, 8.5, 8.2, 8.6, 8.0, 7.3, 7.1, 7.4, 7.3, 7.8, 11.0],
    },
  },
  lossCurve: {
    figure: 'Fig. 8',
    // Normalized point loss (EMA) every 5,000 training steps.
    x: [0, 5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000, 50000, 55000, 60000, 65000, 70000, 75000, 80000],
    series: {
      'Scale-invariant': [1.0, 0.5, 0.22, 0.12, 0.085, 0.085, 0.06, 0.045, 0.04, 0.04, 0.045, 0.04, 0.04, 0.045, 0.045, 0.035, 0.03],
      'Metric scale': [1.0, 0.78, 0.42, 0.25, 0.18, 0.2, 0.12, 0.1, 0.085, 0.075, 0.075, 0.065, 0.06, 0.065, 0.065, 0.055, 0.05],
    },
  },
  group: {
    figure: 'Fig. 12, bottom',
    note: 'Camera pose ATE (m) on ScanNetV2, 90 frames. Read from the figure, about ±0.001.',
    x: [1, 10, 20, 30, 40, 50, 60, 70, 80, 90],
    xLabel: 'group size G (frames)',
    series: {
      'Scale-invariant': [0.037, 0.034, 0.034, 0.033, 0.032, 0.032, 0.032, 0.031, 0.031, 0.031],
      'Metric scale': [0.045, 0.042, 0.042, 0.041, 0.04, 0.04, 0.039, 0.039, 0.038, 0.038],
    },
  },
  unified: {
    table: 'Table 13',
    note: '(Acc. + Comp.) / 2 on 7-Scenes, NRGBD and DTU; lower is better. Each specialized model is trained for one setting only.',
    columns: [
      ['Offline only', 'Scale-invariant'],
      ['Offline only', 'Metric scale'],
      ['Online only', 'Scale-invariant'],
      ['Online only', 'Metric scale'],
      ['Image only', 'Scale-invariant'],
      ['Image only', 'Metric scale'],
    ],
    rows: [
      { label: 'Specialized', values: [0.052, 0.113, 0.06, 0.184, 0.046, 0.097], avg: 0.092 },
      { label: 'Unified (UniT)', values: [0.046, 0.108, 0.07, 0.141, 0.046, 0.108], avg: 0.087, ours: true },
    ],
  },
  paradigms: {
    figure: 'Fig. 2',
    capabilities: ['Online', 'Offline', 'Multi-modal', 'Long horizon', 'Metric scale'],
    rows: [
      { name: 'CUT3R', how: 'frame-by-frame recurrence', has: [true, false, false, true, true] },
      { name: 'VGGT', how: 'joint offline inference', has: [false, true, false, false, false] },
      { name: 'MapAnything', how: 'offline, plus modality and scale parts', has: [false, true, true, false, true] },
      { name: 'UniT', how: 'next-group prediction', has: [true, true, true, true, true], ours: true },
    ],
  },
  data: {
    table: 'Table 1',
    rows: [
      { name: 'ScanNet++', type: 'Indoor', scenes: 1006, real: true, dynamic: false, ratio: 8.2 },
      { name: 'ARKitScenes', type: 'Indoor', scenes: 1661, real: true, dynamic: false, ratio: 3.0 },
      { name: 'ScanNet', type: 'Indoor', scenes: 1513, real: true, dynamic: false, ratio: 5.9 },
      { name: 'Matterport3D', type: 'Indoor', scenes: 90, real: true, dynamic: false, ratio: 4.4 },
      { name: 'DynReplica', type: 'Indoor', scenes: 524, real: false, dynamic: true, ratio: 6.2 },
      { name: 'Hypersim', type: 'Indoor', scenes: 461, real: false, dynamic: false, ratio: 5.8 },
      { name: 'Waymo', type: 'Outdoor', scenes: 798, real: true, dynamic: true, ratio: 7.9 },
      { name: 'Mapfree', type: 'Outdoor', scenes: 460, real: true, dynamic: false, ratio: 6.2 },
      { name: 'VKITTI', type: 'Outdoor', scenes: 5, real: false, dynamic: true, ratio: 1.7 },
      { name: 'MVS-Synth', type: 'Outdoor', scenes: 120, real: false, dynamic: true, ratio: 3.6 },
      { name: 'ParaDomain4D', type: 'Outdoor', scenes: 1528, real: false, dynamic: true, ratio: 8.0 },
      { name: 'GTA-SfM', type: 'Outdoor', scenes: 200, real: false, dynamic: true, ratio: 4.9 },
      { name: 'MatrixCity', type: 'Outdoor', scenes: 24, real: false, dynamic: false, ratio: 3.9 },
      { name: 'Mid-Air', type: 'Outdoor', scenes: 7, real: false, dynamic: false, ratio: 4.9 },
      { name: 'UnrealStereo4K', type: 'Mixed', scenes: 9, real: false, dynamic: false, ratio: 1.0 },
      { name: 'TartanAir', type: 'Mixed', scenes: 1037, real: false, dynamic: true, ratio: 7.3 },
      { name: 'PointOdyssey', type: 'Mixed', scenes: 159, real: false, dynamic: true, ratio: 3.0 },
      { name: 'Spring', type: 'Mixed', scenes: 38, real: false, dynamic: true, ratio: 0.6 },
      { name: 'WildRGBD', type: 'Object', scenes: 2754, real: true, dynamic: false, ratio: 7.0 },
      { name: 'OmniObject3D', type: 'Object', scenes: 6000, real: false, dynamic: false, ratio: 3.3 },
      { name: 'HuMMan', type: 'Human', scenes: 907, real: true, dynamic: true, ratio: 3.0 },
    ],
  },
};
