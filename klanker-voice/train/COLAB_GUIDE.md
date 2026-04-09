# Training "Hey Klanker" wake word — Colab guide

## Step 1: Open the notebook
https://colab.research.google.com/drive/1q1oe2zOyZp7UsB3jJiQ1IFn8z5YfjwEb

## Step 2: Keep it alive
Open browser console (F12) and paste this to prevent idle disconnect:

```javascript
function keepAlive() {
  document.querySelector("colab-connect-button")?.click();
  console.log("keepAlive ping", new Date().toLocaleTimeString());
}
setInterval(keepAlive, 60000);
```

## Step 3: Set the wake word
In the first cell, set: `target_word = "hey klanker"`

## Step 4: Run all
Runtime → Run All

## Step 5: Download the model
When done, find `my_custom_model/hey_klanker.onnx` in the left file browser.
Download it.

## Step 6: Place the model
Copy to: `klanker-voice/assets/hey_klanker.onnx`

The app picks it up automatically on next start.
