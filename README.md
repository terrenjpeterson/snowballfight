# Snowball Fight Alexa Game

Alexa buttons game that simulates throwing a snowball with a button

![](icons/icon108x108.png)

**Table of Contents**

- [Where are the APL documents?](#aplDocuments)
- [How do you pass the score into the APL document?](#aplData)
- [How do the buttons work?](#echoButtons)
- [How does Alexa's voice change?](#pollyIntro)
- [How does the build pipeline work?](#devOps)

## APL Documents

There are four different APL documents that are used by this skill.
They can be found in the /data folder, and each serves a different stage of the game (intro, in-progress, score update).

## APL Data

To pass the scores into the APL document, a handler is used to create the object that is passed through the datasources attribute in the APL directive.
Here is an example of what the object looks like. Please note, the type needs to be set in the object, else the APL directive won't properly handle the information.

```
{
    "scoreMetadata": {
        "type": "object",
        "data": {
            "title": "Red: 1 Blue: 0",
            "redScore": "Red: 1",
            "blueScore": "Blue: 0"
        }
    }
}
```

The APL document then has an attribute that reads in the parameter, then converts it to a text item on the display.
Here is an example of the aplTwoPlayerGame.json document that provides an update on the score of a two player game.

```
{
  "type": "Text",
  "text": "${payload.scoreMetadata.data.blueScore}",
  "position": "absolute",
  "left": "55vh",
  "top": "40vh",
  "style": "blueText",
  "fontSize": "6vw"
}
```

## Echo Buttons

First to begin the button registration process, the rollCall must be executed for the skill. This wakes the buttons for the specific user.
The rollCall specifies which events to listen for, and sets a default timeout parameter.
The user will need to press the buttons which will then create an event that the lambda function receives.
Once the event is received, the gadget id's are recorded for the unique button, which then allows matching during gameplay.
To change color in the buttons, or turn off, a directive is needed to be set within the actual skill.
Handlers within the skill create the object needed for the directive.

## Polly Intro

To override the native Alexa voice, just use the <voice name> SSML markup within the skill.
The exact data can be found in the scenarios.json file in the /data folder.

## Dev Ops

The process for building the new version of the application has been automated in the build.sh script. 
This zips up the necessary files locally, stages into an S3 bucket, then overlays the Lambda function with the new version of code.
After the new version is deployed, it runs a brief test invoking the function from the command line with data in the /testdata folder.
