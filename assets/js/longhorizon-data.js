// Long-horizon perception on NRGBD (the paper's Fig. 9), metric scale.
// The paper gives these curves only as a plot, so the values below were read
// from the marker centres of the full-resolution figure (img/longhorizonpose.png
// and img/longhorizondepth.png in the arXiv source), calibrated on the plot's
// gridlines. They are accurate to about ±0.005; three markers hidden behind
// others (DepthAnything3 at 50 views, CUT3R at 50 and 100 views for ATE) were
// read from the line segments that meet them. Replace with the raw numbers if
// the authors publish them.
window.UNIT_LONGHORIZON = {
  views: [50, 100, 150, 200, 250, 300, 350, 400, 450, 500],
  switchAt: 300,
  queue: 150,
  metrics: [
    {
      key: 'ate',
      label: 'Pose accuracy',
      unit: 'ATE (m)',
      domain: [0, 0.8],
      ticks: [0, 0.2, 0.4, 0.6, 0.8],
      series: {
        CUT3R: [0.047, 0.101, 0.209, 0.302, 0.397, 0.452, 0.558, 0.67, 0.698, 0.733],
        DepthAnything3: [0.066, 0.127, 0.171, 0.19, 0.219, 0.239],
        UniT: [0.057, 0.112, 0.148, 0.164, 0.186, 0.209, 0.233, 0.245, 0.249, 0.254],
      },
    },
    {
      key: 'rmse',
      label: 'Depth accuracy',
      unit: 'RMSE (m)',
      domain: [0.3, 0.6],
      ticks: [0.3, 0.4, 0.5, 0.6],
      series: {
        CUT3R: [0.356, 0.376, 0.4, 0.435, 0.511, 0.535, 0.534, 0.535, 0.546, 0.548],
        DepthAnything3: [0.469, 0.457, 0.435, 0.419, 0.42, 0.41],
        UniT: [0.418, 0.406, 0.388, 0.368, 0.362, 0.362, 0.363, 0.377, 0.392, 0.404],
      },
    },
  ],
};
