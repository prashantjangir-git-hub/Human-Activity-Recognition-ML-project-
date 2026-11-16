# Human Activity Recognition from Smartphone Sensors (ES 335, 2026)

Can a 2.56-second window of waist-worn phone accelerometer and gyroscope data tell which of six activities a **new, unseen person** is doing? We compare a majority-class baseline, logistic regression, random forest, an RBF-kernel SVM and k-NN on the UCI HAR dataset, using subject-grouped cross-validation for tuning and model selection and a held-out set of 9 people for the final test.

**Website:** https://prashantjangir-git-hub.github.io/Human-Activity-Recognition-ML-project-/

## Main result

| Model | CV macro-F1 (grouped by person) | Test macro-F1 | 95% interval (bootstrap over test people) |
|---|---|---|---|
| Majority class | 0.054 | 0.051 | 0.050–0.053 |
| **Logistic regression (selected)** | **0.934** | **0.950** | 0.915–0.976 |
| Random forest | 0.918 | 0.923 | 0.890–0.954 |
| SVM (RBF) | 0.932 | 0.956 | 0.932–0.974 |
| k-NN | 0.873 | 0.883 | 0.851–0.911 |

Logistic regression was selected by CV before the test set was used. The SVM's slightly higher test score is within noise (paired difference −0.006, 95% interval [−0.021, +0.003]).

## Repository layout

```
analysis.ipynb      full analysis: data checks, grouped CV tuning, test evaluation, error analysis, exports
results/            figures, the model comparison table and the full grid-search results, written by the notebook
docs/               the website (served by GitHub Pages from /docs)
  data/             JSON files written by the notebook; the site reads only these
                    (character.js is a prebuilt 3D-figure asset, see "Third-party assets")
requirements.txt
```

## Reproduce

```bash
git clone https://github.com/prashantjangir-git-hub/Human-Activity-Recognition-ML-project-.git
cd Human-Activity-Recognition-ML-project-
pip install -r requirements.txt          # Python 3.11+ (tested with 3.13 and 3.14, identical results)

# Download the dataset (https://archive.ics.uci.edu/dataset/240) and unzip it here,
# so that "UCI HAR Dataset/" sits next to analysis.ipynb. Both the plain and the
# double-nested "UCI HAR Dataset/UCI HAR Dataset/" layouts work.

jupyter nbconvert --to notebook --execute --inplace analysis.ipynb   # ~6-7 min on 2 cores

open docs/index.html                                                 # or double-click it
```

The notebook writes each result to `docs/data/*.json` and also bundles them into `docs/data/data.js`, which the page loads directly. That is why the site works both from disk and on GitHub Pages.

**Split:** the dataset's own subject-disjoint split (train people 1, 3, 5, 6, 7, 8, 11, 14, 15, 16, 17, 19, 21, 22, 23, 25, 26, 27, 28, 29, 30; test people 2, 4, 9, 10, 12, 13, 18, 20, 24). **CV:** `GroupKFold(5)` by person on the training set only. **Seed:** 42.

## Data and licence

UCI HAR Dataset, Anguita et al. (2013), distributed by the UCI Machine Learning Repository under CC BY 4.0. It is not committed to this repo; download it from the link above.

## Third-party assets

`docs/data/character.js` holds the 3D figure used in the website demo: the "Ch03" character and animations from [Adobe Mixamo](https://www.mixamo.com), packed into a JavaScript file for the site's small WebGL renderer (`docs/js/figure3d.js`). It is a prebuilt asset and is not produced by `analysis.ipynb`. The figure only illustrates the demo model's prediction; it plays no part in any result.

## AI tools disclosure

- **Gemini:** drafting initial code structure and a base version of the website.
- **Claude:** reviewing the project; the error analysis; making the demo 3d model; rebuilding the website interactions; editing.

We checked the outputs against the notebook, re-ran the full analysis, and are responsible for every result.

## References

1. J. Reyes-Ortiz, D. Anguita, A. Ghio, L. Oneto, X. Parra. *Human Activity Recognition Using Smartphones* [Dataset]. UCI Machine Learning Repository, 2013. https://doi.org/10.24432/C54S4K (CC BY 4.0)
2. D. Anguita, A. Ghio, L. Oneto, X. Parra, J. L. Reyes-Ortiz. A Public Domain Dataset for Human Activity Recognition Using Smartphones. *ESANN*, 2013.
3. F. Pedregosa et al. Scikit-learn: Machine Learning in Python. *Journal of Machine Learning Research* 12, 2825–2830, 2011.
4. L. Breiman. Random Forests. *Machine Learning* 45(1), 5–32, 2001.
5. C. Cortes, V. Vapnik. Support-vector networks. *Machine Learning* 20(3), 273–297, 1995.
6. 3D character and animations: "Ch03", Adobe Mixamo, https://www.mixamo.com
