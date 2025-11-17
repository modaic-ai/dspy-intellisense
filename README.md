# dspy-intellisense by Modaic

IntelliSense for DSPy. Tracks and annotates input and output fields from Signatures to Predictions.

## Features

### Completion suggestions for inputs

![Input Completions ](images/input_completion.png)

### Hover annotations for inputs

![Input Annotations](images/input_hover.png)

### Hover annotations for `Prediction` objects

![Prediction Annotations](images/prediction_hover.png)

### Completion suggestions for outputs

![Output Completions](images/output_completion.png)

### Hover annotations for outputs

![Output Annotations](images/output_hover.png)

### Works with inline signatures too!

![Inline Signature](images/inline_signature.png)

## Extension Settings

You can change the highlight color of Prediction output fields by changing the following VSCode `settings.json`. Note, by default the highlight color is `#9CDCFE`

```json
{
  "dspyIntellisense.decorationHighlighting.color": "#a5e075" // change to your preferred output field highlight color
}
```

## Known Issues

- The highlight color of output fields will not match your theme's color for attributes by default. You must configure it mannually using the `"dspyIntellisense.decorationHighlighting.color"` setting.

## Release Notes

### 1.0.0

Initial release of DSPy IntelliSense
