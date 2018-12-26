// This is the main processing for the Alexa Snowball FIght Skill

'use strict';
const Alexa = require("alexa-sdk");
const appId = 'amzn1.ask.skill.0f8fdbe7-01a2-41d0-877a-c393e543dc58';

// these are the parameters used to perform a roll call with the button
let buttonStartParams = require("data/rollCall.json");

// These are the backgrounds used to display on the screen including the initial launch
const startupImage = 'https://s3.amazonaws.com/snowballgame/images/1024x600background.png';
const skillName = 'Snowball Fight';
const startupTitle = 'Watch out for the cold!';

// these utility methods for creating Image and TextField objects for the echo show
const makePlainText = Alexa.utils.TextUtils.makePlainText;
const makeImage     = Alexa.utils.ImageUtils.makeImage;

// game parameters
const minScore = 2;
const expertLevel = 20;
const starLevel = 12;
const advancedLevel = 5;

const scenarios = [
    { 
	"throwNeeded":true,  
	"timeout":25000, 
	"description":"You see a blue hat above the wall of the snow fort.",
	"successMessage":'Nice shot!<break time="1s"/><voice name="Justin">Where did that come from?</voice><break time="1s"/>You knocked his hat off with that throw.',
	"errorMessage":"Too late. You just got blasted with a snowball.<break time=\"1s\"/><voice name=\"Justin\">Ha Ha!</voice>"
    },
    { 
	"throwNeeded":false, 
	"timeout":25000, 
	"description":'You hear your mom calling you.<break time="1s"/><voice name="Joanna">I made some hot chocolate. Get it before it turns cold!</voice>',
	"errorMessage":"Oh no.<break time=\"1s\"/><voice name=\"Joanna\">Okay, time to go inside. No throwing snowballs at your mother!</voice><break time=\"1s\"/>Next time don't press your button to throw at her.",
	"successMessage":"Smart move. No need to throw a snowball at your mother, and this hot chocolate has marshmallows!"
    },
    {
        "throwNeeded":true,
        "timeout":25000,
        "description":"You see a pile of snowballs inside the snow fort.",
	"errorMessage":"Too slow. You just got hit with a snowball.",
        "successMessage":"Good job!<break time=\"1s\"/><voice name=\"Justin\">Oh no. Now I have to make more.</voice><break time=\"1s\">That's less snowballs you need to worry about."
    },
    {
        "throwNeeded":true,
        "timeout":25000,
        "description":"There's a icicle on the edge of your garage.<audio src='soundbank://soundlibrary/magic/amzn_sfx_fairy_sparkle_chimes_01'/> ",
	"errorMessage":"Too much watching the ice melt. You got hit from the back by a snowball. ",
        "successMessage":"Good aim. It came down in one shot. "
    },
    {
        "throwNeeded":true,
        "timeout":20000,
        "description":"You see a girl running at you with a snowball in her hand.<break time=\"1s\"/><voice name=\"Ivy\">Take that!</voice>",
	"errorMessage":"Wow that was cold!<break time=\"1s\"/><voice name=\"Ivy\">Got you!</voice>",
        "successMessage":"That was a close one.<break time=\"1s\"/><voice name=\"Ivy\">You missed and I'm coming back!</voice>"
    }
];

// this is the card that requests feedback after the game is played
const cardTitle = "Game Complete";
const cardFeedback = "Thank you for playing the Snowball Fight Skill\n" +
    "If you enjoyed playing this, please take a minute to provide a review in the Alexa Skill Store.\n" +
    "1. Open the Alexa app on your phone\r" +
    "2. Go to the Skills section\r" +
    "3. Tap 'Your Skills' in the top right corner\r" +
    "4. Find the 'Snowball Fight' skill\r" +
    "5. Scroll down and tap 'Write a Review'\r" +
    "6. Provide feedback including a star rating";

// this is the variable for skipping buttons.
var buttonSkip = 3;

// main handler
exports.handler = function(event, context, callback) {
    var alexa = Alexa.handler(event, context);
    console.log("initialize session");
    alexa.appId = appId;

    // log event data for every request
    console.log(JSON.stringify(event));

    // this is for the table that persists session data
    alexa.dynamoDBTableName = 'snowballFight';

    // register handlers
    alexa.registerHandlers(handlers);
    console.log("ready to execute");
    alexa.execute();
};

// these are the handlers associated with different intents
const handlers = {
    'LaunchRequest': function () {
	let speechOutput = "";
	this.attributes['buttonSkip'] = 0;

	// these are needed to construct the directives that may be used for an echo show
        const builder = new Alexa.templateBuilders.BodyTemplate1Builder();
        const template = builder.setTitle(startupTitle)
                                .setBackgroundImage(makeImage(startupImage))
                                .setTextContent(makePlainText(skillName))
                                .build();

	// vary the intro based on if the game has been played by the user before
	if (this.attributes['highScore'] > 1) {
	    console.log("Returning User. Last score was: " + this.attributes['highScore']);
	    speechOutput = "Welcome back to the snowball fight. " +
		"Your previous high score is " + this.attributes['highScore'] + ". " +
		"<audio src='https://s3.amazonaws.com/ask-soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_intro_01.mp3'/>" +
		"Do you have Echo buttons to play the game with?";
	} else {
	    console.log("First Time user");
	    this.attributes['highScore'] = 0;
	    speechOutput = "Welcome to the snowball fight game." +
		"<audio src='https://s3.amazonaws.com/ask-soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_intro_01.mp3'/>" +
		"Get ready to start throwing snowballs, and ducking into a snow fort. " +
		"Do you have Echo buttons?";
	}

        const reprompt = "If you have Echo buttons, please say yes, or press one to begin the registration. ";

        // initiate settings for buttons if they are attached - and override time to 60 seconds
	buttonStartParams.timeout = 60000;
        this.response._addDirective(buttonStartParams);
        
        // initialize game parameters
        this.attributes['originatingRequestId'] = this.event.request.requestId;
        this.attributes['round'] = 1;
 	this.attributes['gameOver'] = false;
	this.attributes['scenariosIndex'] = 0;
	this.attributes['gameMode'] === "TBD";

        // Build the 'button down' animation for when the button is pressed.
        this.response._addDirective(buildButtonDownAnimationDirective([]));

        if (this.event.context.System.device.supportedInterfaces.Display) {
            console.log("this was requested by an Echo Show");
            this.response.speak(speechOutput).listen(reprompt).renderTemplate(template);
        } else {
            console.log("this was requested by a device without a display");
            this.response.speak(speechOutput).listen(reprompt);
	}
        this.emit(':responseReady');
    },
    // this is the logic that relates to a response from the user indicating that they have buttons
    'AMAZON.YesIntent': function() {
        console.log("Yes utterance made. Prompt to begin the button registration process.");

        if (this.attributes['gameOver']) {
            console.log("Attempt to play a game that is over.");
            this.emit('GameOver');
        } else {
            let speechOutput = "Please press your first button to begin the registration process.";
	    	speechOutput = speechOutput + "<audio src='https://s3.amazonaws.com/ask-soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_waiting_loop_30s_01.mp3'/>";

            const reprompt = "If you have buttons, please press the first one to begin the registration process, else say no.";

            // extend the lease on the buttons so they don't time out
            this.response._addDirective(buttonStartParams);

            this.response.speak(speechOutput).listen(reprompt);
            this.emit(':responseReady');
	}
    },
    // this is the intent that executes if the user has indicated that they don't have buttons
    'AMAZON.NoIntent': function() {
        console.log("No utterance made.");
	this.attributes['buttons'] = false;

	// first check to make sure that this intent can be properly executed
	if (this.attributes['gameOver']) {
            console.log("Attempt to play a game that is over.");
            this.emit('GameOver');
	} else if (this.attributes['round'] > 1 && this.attributes['firstGadgetId']) {
	    console.log("Inadvertent utterance - game in-progress");
            delete this.handler.response.response.shouldEndSession;
            this.emit(':responseReady');	
	} else if (this.attributes['firstGadgetId']) {
	    // begin the round of a single player game
	    console.log("Begin a solo match.");
	    this.attributes['gameMode'] = "SOLO";

	    // create the initial audio to stage the game
	    let speechOutput = "Okay, let's begin a solo match. " + '<break time="1s"/>' +
		"You walk outside, and it's a beautiful winter day! " +
		"<audio src='soundbank://soundlibrary/nature/amzn_sfx_strong_wind_whistling_01'/>" +
		"You see one of your friends working on their snow fort. " +
		"Looks like an easy target as they haven't seen you yet!";	
	    let repeatOutput = "You are outside and see one of your friends working on their snow fort. " +
		"Press the button if you want to throw a snowball at them.";

	    // set the parameter indicating that a snowball should be thrown
	    this.attributes['throwNeeded'] = true;

            // extend the lease on the buttons for 30 seconds - this is now game mode
            buttonStartParams.timeout = 30000;
            this.response._addDirective(buttonStartParams);

	    this.response.speak(speechOutput).listen(repeatOutput);
	    this.emit(':responseReady');
	} else {
	    // intro to the game
	    console.log("User indicated that they didn't have buttons.");
            let speechOutput = "Sorry, you need Echo Buttons to play this game.";

            this.response.speak(speechOutput);
            this.emit(':responseReady');
	}
    },
    'Goodbye': function () {
        this.emit('AMAZON.StopIntent');
    },
    'GameEngine.InputHandlerEvent': function () {
        console.log('event generated at ' + this.event.request.timestamp.slice(11, 19));

        // save the last time (in seconds) when a button was pressed
        let buttonPressTime = (Number((this.event.request.timestamp.slice(14,16) * 60)) + Number(this.event.request.timestamp.slice(17,19)));

        let buttonGap = 999;
        if (this.attributes['buttonPressTime']) {
            buttonGap = buttonPressTime - this.attributes['buttonPressTime'];
            if (buttonGap < 0) {
                buttonGap = 100;
            }
            console.log("Time between events:" + buttonGap);
        }
        this.attributes['buttonPressTime'] = buttonPressTime;

	this.attributes['originatingRequestId'] = this.event.request.requestId;

        if (this.event.request.events[0].name === 'button_down_event' && buttonGap > this.attributes['buttonSkip']) {
            // determine which button has been pushed based on prior results and the gadgetId
            if (this.attributes['firstGadgetId']) {
                if (this.attributes['secondGadgetId']) {
                    if (this.event.request.events[0].inputEvents[0].gadgetId === this.attributes['firstGadgetId']) {
                        this.emit('FirstButtonPushed');
                    } else if (this.event.request.events[0].inputEvents[0].gadgetId === this.attributes['secondGadgetId']) {
                        this.emit('SecondButtonPushed');
                    } else {
                        this.emit('ExtraButtonPushed');
                    }    
                } else {
		    // this gets invoked if only one button is being used
		    if (this.attributes['gameMode'] === "SOLO") {
			this.emit('FirstButtonPushed');
                    } else if (this.attributes['firstGadgetId'] === this.event.request.events[0].inputEvents[0].gadgetId) {
                        this.emit('DuplicateButtonPushed');
                    } else {
                        this.emit('ButtonsRegistered');
                    }
                }
            } else {
                this.emit('FirstButtonRegistered');
            }
        } else if (this.event.request.events[0].name === 'timeout') {
	    this.emit('HandleTimeout');
        } else {
            // this is to remove rapid fire buttons
            console.log("Skipping extra buttons");
            // Don't end the session, and don't open the microphone.
            delete this.handler.response.response.shouldEndSession;
	    this.emit(':responseReady');            
        }
    },
    // process timeout
    'HandleTimeout': function() {
	console.log("Process Timeout");

	if (this.attributes['gameOver']) {
            console.log("button timed out, game already over, so don't override message.");
            // Don't end the session, and don't open the microphone.
            delete this.handler.response.response.shouldEndSession;
            this.emit(':responseReady');
	} else if (this.attributes['firstGadgetId']) {
            console.log(JSON.stringify(this.event.request.events[0]));

	    if(this.attributes['throwNeeded']) {
		console.log("Throw needed. Game over.");
		// build the audio response to end the game
	    	let speechOutput = "<audio src='https://s3.amazonaws.com/ask-soundlibrary/foley/amzn_sfx_swoosh_fast_1x_01.mp3'/>" +
                    "<audio src='https://s3.amazonaws.com/ask-soundlibrary/impacts/amzn_sfx_punch_01.mp3'/>" +
		    scenarios[this.attributes['scenariosIndex']].errorMessage +		    	
		    "Time to go inside and warm-up. " + '<break time="1s"/>' +
		    "Thanks for playing!";
                this.response.speak(speechOutput)

        	// reset the gadgets for the next session
        	this.attributes['firstGadgetId'] = null;
        	this.attributes['secondGadgetId'] = null;

                this.emit(':responseReady');
                console.log(JSON.stringify(this.response));

	    } else {
            	this.emit('GoodNoThrow');
	    }
	} else {
            console.log("button timed out, but no gadget registered yet.");
            // Don't end the session, and don't open the microphone.
            delete this.handler.response.response.shouldEndSession;
            this.emit(':responseReady');
	}
    },
    // this handles when a scenario exists where nothing should be thrown
    'GoodNoThrow': function() {
	console.log("No throw required. Continue with another round.");

	// acknowledge that the choice was correct
	let speechOutput = scenarios[this.attributes['scenariosIndex']].successMessage + " ";
	this.attributes['round'] += 1;

	// build the message for the next round including a random saying
	const scenariosIndex = Math.floor(Math.random() * scenarios.length);
	console.log("Next Scenario:" + scenariosIndex);

	speechOutput = speechOutput + scenarios[scenariosIndex].description + '<break time="1s"/>';
	let repeatOutput = scenarios[scenariosIndex].description + '<break time="1s"/>';
	this.response.speak(speechOutput).listen(repeatOutput);

	// save attributes for next event
	this.attributes['throwNeeded'] = scenarios[scenariosIndex].throwNeeded;
	this.attributes['scenariosIndex'] = scenariosIndex;
                
	// extend the lease on the buttons based on the length of the audio in the scenario
	buttonStartParams.timeout = scenarios[scenariosIndex].timeout;
	this.response._addDirective(buttonStartParams);
	this.response._addDirective(buildButtonIdleAnimationDirective([this.attributes['firstGadgetId']], breathAnimationRed));
                
	this.emit(':responseReady');
	console.log(JSON.stringify(this.response));
    },
    // this gets invoked when the first button is pushed during gameplay.
    'FirstButtonPushed': function() {
        console.log("Button Pushed by player one.");

	if (this.attributes['gameOver']) {
	    console.log("Attempt to play a game that is over.");
            this.emit('GameOver');
        } else if (this.attributes['throwNeeded']) {

            // retreive saved attributes for gameplay
            let counter = Number(this.attributes['round']);

            // create sounds indicating a hit with the snowball
            let speechOutput = "<audio src='https://s3.amazonaws.com/ask-soundlibrary/foley/amzn_sfx_swoosh_fast_1x_01.mp3'/>" +
                "<audio src='https://s3.amazonaws.com/ask-soundlibrary/impacts/amzn_sfx_punch_01.mp3'/>" +
		'<break time="1s"/>' +
		scenarios[this.attributes['scenariosIndex']].successMessage + '<break time="1s"/>';

	    // build the message for the next round including a random saying
	    const scenariosIndex = Math.floor(Math.random() * scenarios.length);
            speechOutput = speechOutput + scenarios[scenariosIndex].description + '<break time="1s"/>';
	    let repeat = scenarios[scenariosIndex].description + '<break time="1s"/>';

            // save attributes for next event
            counter++;
            this.attributes['round'] = counter;
            this.attributes['throwNeeded'] = scenarios[scenariosIndex].throwNeeded;
            this.attributes['scenariosIndex'] = scenariosIndex;

            // extend the lease on the buttons and reanimate the first player button
	    buttonStartParams.timeout = scenarios[scenariosIndex].timeout;
            this.response._addDirective(buttonStartParams);
            this.response._addDirective(buildButtonIdleAnimationDirective([this.attributes['firstGadgetId']], breathAnimationRed));

            this.response.speak(speechOutput).listen(repeat);
	    this.emit(':responseReady');
	    console.log(JSON.stringify(this.response));
        } else {
	    this.emit('SnowballTrouble');
	}
    },
    // this is the function that gets called when the user hits something with a snowball that they weren't supposed to
    'SnowballTrouble': function() {
        console.log("Threw a snowball and hit something - game over.");

        // create sounds indicating a smash, negative response, then an intro for the end of game.
        let speechOutput = "<audio src='https://s3.amazonaws.com/ask-soundlibrary/foley/amzn_sfx_swoosh_fast_1x_01.mp3'/>" +
	    "<audio src='https://s3.amazonaws.com/ask-soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_negative_response_02.mp3'/>" +
	    scenarios[this.attributes['scenariosIndex']].errorMessage + '<break time="1s"/>';

	// this round wasn't successful, so decrement so it doesn't count towards high score
	this.attributes['round'] -= 1;

	// check if the game was just getting started - redirect user as they might not understand how to play
	if (this.attributes['round'] > minScore) {
	    speechOutput = speechOutput + "You were able to get " + this.attributes['round'] + " correct in a row. " +
            	"<audio src='https://s3.amazonaws.com/ask-soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_outro_01.mp3'/>";
	} else {
            console.log("Give message around instructions.");
	}

	// check for high score
	if (this.attributes['round'] > this.attributes['highScore']) {
	    console.log("New High Score");
	    this.attributes['highScore'] = this.attributes['round'];
	    if (this.attributes['round'] > minScore) {
		speechOutput = speechOutput + "Congratulations on a new high score! ";
		if (this.attributes['round'] > expertLevel) {
		    speechOutput = speechOutput + "You made it to the expert level animal saving crew! ";
		} else if (this.attributes['round'] > starLevel) {
		    speechOutput = speechOutput + "You made it to the star level animal saving team! ";
		} else if (this.attributes['round'] > advancedLevel) {
		    speechOutput = speechOutput + "You are an advanced animal rescuer! ";
		}
	    }
	}

	speechOutput = speechOutput + "Please say 'Start Over' to try again, or say 'Stop' if you are all done.";
	const reprompt = "Ready to try again? Just say 'Start Over' to begin a new game.";

        // identify the game as over until a reset occurs
	this.attributes['gameOver'] = true;

        // initiate settings for buttons so they don't timeout ahead of the speechOutput and reprompt
        this.response._addDirective(buttonStartParams);

        this.response.speak(speechOutput).listen(reprompt);
        this.emit(':responseReady');
	console.log(JSON.stringify(this.response));
    },
    // this is called when someone attempts to continue playing a game that is already over
    'GameOver': function() {
	console.log("Reprompt to say Start Over, or Stop.");

	const speechOutput = "Sorry, this game has ended. Please say 'Start Over' to try again, or 'Stop' if you are done.";
	const reprompt = "This game is over. Say 'Start Over' to try again, or say 'Stop' if you are done.";

        this.response.speak(speechOutput).listen(reprompt);
        this.emit(':responseReady');
    },
    // this is the logic that gets invoked when the blue button is pressed, or the word 'Save' is used
    'SecondButtonPushed': function() {
        console.log("Save button pushed for - " + this.attributes['soundType']);

        if (this.attributes['gameOver']) {     
            console.log("Attempt to play a game that is over.");
	    this.emit('GameOver');
        } else {
            // retreive saved attributes for gameplay
            let counter = Number(this.attributes['round']);

            this.response.speak(speechOutput).listen(repeat);
	    this.emit(':responseReady');
        }
    },
    // this registers the first button and will be used to throw snowballs
    'FirstButtonRegistered': function() {
        const speechOutput = "Great.  The button is now active, and can be used to throw snowballs. " +
            "Do you want to play a two player game? Say 'No' if you want to play in solo mode, " +
	    "or press another button to add a second player.";
        const repeat = "Is there a second player? If so, Please push a second button so we can begin the game, or say 'No'.";
        console.log("First button registered");

        // save the gadget id for future reference
        this.attributes['firstGadgetId'] = this.event.request.events[0].inputEvents[0].gadgetId;

        // the button was just woken up, so color red and send animations
        this.response._addDirective(buildButtonIdleAnimationDirective([this.event.request.events[0].inputEvents[0].gadgetId], 
            breathAnimationRed));
        this.response._addDirective(buildButtonDownAnimationDirective([this.event.request.events[0].inputEvents[0].gadgetId]));

        // extend the lease on the buttons for another 60 seconds
        this.response._addDirective(buttonStartParams);
        
        this.response.speak(speechOutput).listen(repeat);
	this.emit(':responseReady');
    },
    // this gets invoked after the second button gets registered.  It signals that the game can now begin.
    'ButtonsRegistered': function() {
        console.log("Second button registered - ready to begin game.");

        let speechOutput = "Excellent! You have registered a second button to play a two player game. " +
	    "Remember, whomever is first at hitting the target wins a point, but if you throw a snowball when you're not supposed to, " +
	    "your game will be done as you need to go inside. " +
            '<break time="2s"/>' +
            "Now let's get ready to play. " + '<break time="1s"/>' +
            "<audio src='https://s3.amazonaws.com/ask-soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_intro_01.mp3'/>" +
            '<break time="1s"/>' +
	    "You walk outside, and it's a beautiful winter day! " +
	    "<audio src='soundbank://soundlibrary/nature/amzn_sfx_strong_wind_whistling_01'/>" +
	    "You see one of your friends working on their snow fort. " +
	    "Looks like an easy target as they haven't seen you yet!";
	
	// set the parameter indicating that a snowball should be thrown
	this.attributes['throwNeeded'] = true;

	let repeat = "You are outside and see one of your friends working on their snow fort. " +
	    "Press the button if you want to throw a snowball at them.";

	// set the skip button attribute to facilitate accurate gameplay
	this.attributes['buttonSkip'] = buttonSkip;
        
        // save the gadget id for future reference
        this.attributes['secondGadgetId'] = this.event.request.events[0].inputEvents[0].gadgetId;

        // the button was just woken up, so color blue and send animations
        this.response._addDirective(buildButtonIdleAnimationDirective([this.event.request.events[0].inputEvents[0].gadgetId], 
            breathAnimationBlue));
        this.response._addDirective(buildButtonDownAnimationDirective([this.event.request.events[0].inputEvents[0].gadgetId]));

        // extend the lease on the buttons for 30 seconds - this is now game mode
	buttonStartParams.timeout = 30000;
        this.response._addDirective(buttonStartParams);

        this.response.speak(speechOutput).listen(repeat);
	this.emit(':responseReady');
    },
    // this gets invoked when a third button gets pushed - the gameplay only supports two buttons
    'ExtraButtonPushed': function() {
        const speechOutput = "Sorry, you have already registered two buttons"; 
        const repeat = "Please only press two buttons. ";

        console.log("Two gadgets already registered");

        this.response.speak(speechOutput).listen(repeat);
	this.emit(':responseReady');
    },
    // this gets invoked when one button is attempted for use in the game for two different actions
    'DuplicateButtonPushed': function() {
        const speechOutput = "Sorry, you are already using that as your smash button. Please pick another button to use."; 
        const repeat = "Please press a second button, then we can get started with the game.";

        console.log("Same button picked a second time");

        this.response.speak(speechOutput).listen(repeat);
	this.emit(':responseReady');
    },    
    // this is the function that gets invoked when help is requested
    'AMAZON.HelpIntent': function () {
        let speechOutput = "The object of the game is to knock down as many things as possible with snowballs. " +
            "Just listen carefully to the sounds that are being played. For example, " + 
            "is the sound of a cat. When you hear this sound, press the blue button or say save. " + '<break time="1s"/>' +
            " press the red button to smash it, or just say the word 'smash'. " + '<break time="1s"/>' +
            "See how many correct responses you can get in a row. " + '<break time="1s"/>';
        let reprompt = "";

        if (this.attributes['latestSound']) {
            speechOutput = speechOutput + "Here is the latest sound. " + this.attributes['latestSound'];
            reprompt = "Here is the latest sound. Go ahead and either smash or save. " + this.attributes['latestSound'];
        } else {
            speechOutput = speechOutput + "You are currently setting up to begin a game. ";
            reprompt = "Please an Echo button if you have them, else say no to begin the game. ";
        }

        // extend the lease on the buttons so they don't time out
        this.response._addDirective(buttonStartParams);

        this.response.speak(speechOutput).listen(reprompt);
        this.emit(':responseReady');
    },
    // if the user decides to start over during a game, this intent gets invoked and the score resets
    'AMAZON.StartOverIntent': function () {
        console.log("Start Over Requested");

        // reset the score
        this.attributes['round'] = 1;
	this.attributes['gameOver'] = false;

        let speechOutput = "New game. Now let's get ready to play. " + '<break time="1s"/>' +
            "<audio src='https://s3.amazonaws.com/ask-soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_intro_01.mp3'/>" +
            '<break time="1s"/>';
        let repeat = "Here was the sound again. ";
        
        // extend the lease on the buttons for another 60 seconds
        this.response._addDirective(buttonStartParams);

	if (this.attributes['firstGadgetId']) {
            sound = sound + "Remember, if you hear an insect, press the red button to smash it. " +
            	"Press the blue button if you hear an animal sound and save it. " + '<break time="10s"/>';
	} else {
            sound = sound + "Remember, if you hear an insect, say 'smash' to get it. " +
                "When you hear an animal sound, say 'save' to rescue it. ";
	}

        this.response.speak(speechOutput).listen(repeat);
	this.emit(':responseReady');        
    },
    'AMAZON.CancelIntent': function () {
        this.response.speak("Goodbye");
        this.emit(':responseReady');
    },
    // this processes when the game has exited per the users request
    'AMAZON.StopIntent': function () {
	console.log("Stopped Game");

        let speechOutput = "Thanks for playing Snowball Fight! ";

        // check for high score - this will only get invoked if user quits on a 'winning streak'
        if (this.attributes['round'] > this.attributes['highScore']) {
            console.log("New High Score");
            this.attributes['highScore'] = this.attributes['round'];
	    speechOutput = speechOutput + "Great job on the new high score of " + this.attributes['round'] + ".";
        }

	// in case gadgets were used, reset them in the session
        this.attributes['firstGadgetId'] = null;
        this.attributes['secondGadgetId'] = null;

	// create response to the user
        this.response.speak(speechOutput);
        this.emit(':responseReady');
    },
    'AMAZON.FallbackIntent': function () {
        console.log("Fallback Intent hit.");
        let speechOutput = "Sorry, I didn't understand that request. ";
        let reprompt = "";        

        if (this.attributes['round'] > 1) {
            speechOutput = speechOutput + "Here is the latest sound. " + this.attributes['latestSound'];
            reprompt = "Here is the latest sound. Go ahead and either smash or save. " + this.attributes['latestSound'];
        } else {
            speechOutput = speechOutput + "You are currently setting up buttons to begin a game. ";
            reprompt = "Please press two Echo buttons if you want to play the Snowball Fight game.";
        }

        this.response.speak(speechOutput).listen(reprompt);
        this.emit(':responseReady');
    },
    'SessionEndedRequest': function () {
        console.log('session ended');
        this.emit(":tell", "Thanks for playing. Goodbye!");
    },
    'Unhandled': function () {
        console.log("Unhandled Activity");
        const speechOutput = "Sorry, I didn't understand.";
        const reprompt = "Would you like to try again?";

        this.response.speak(speechOutput).listen(reprompt);
        this.emit(':responseReady');
    }
};

// these are the common Alexa functions for managing the LEDs on the buttons

const buildBreathAnimation = function(fromRgbHex, toRgbHex, steps, totalDuration) {
   const halfSteps = steps / 2;
   const halfTotalDuration = totalDuration / 2;
   return buildSeqentialAnimation(fromRgbHex, toRgbHex, halfSteps, halfTotalDuration)
     .concat(buildSeqentialAnimation(toRgbHex, fromRgbHex, halfSteps, halfTotalDuration));
};

const buildSeqentialAnimation = function(fromRgbHex, toRgbHex, steps, totalDuration) {
   const fromRgb = parseInt(fromRgbHex, 16);
   let fromRed = fromRgb >> 16;
   let fromGreen = (fromRgb & 0xff00) >> 8;
   let fromBlue = fromRgb & 0xff;

   const toRgb = parseInt(toRgbHex, 16);
   const toRed = toRgb >> 16;
   const toGreen = (toRgb & 0xff00) >> 8;
   const toBlue = toRgb & 0xff;

   const deltaRed = (toRed - fromRed) / steps;
   const deltaGreen = (toGreen - fromGreen) / steps;
   const deltaBlue = (toBlue - fromBlue) / steps;

   const oneStepDuration = Math.floor(totalDuration / steps);

   const result = [];

   for (let i = 0; i < steps; i++) {
     result.push({
       "durationMs": oneStepDuration,
       "color": rgb2h(fromRed, fromGreen, fromBlue),
       "blend": true
     });
     fromRed += deltaRed;
     fromGreen += deltaGreen;
     fromBlue += deltaBlue;
   }

   return result;
};

const rgb2h = function(r, g, b) {
   return '' + n2h(r) + n2h(g) + n2h(b);
};
// Number to hex with leading zeros.
const n2h = function(n) {
   return ('00' + (Math.floor(n)).toString(16)).substr(-2);
};


// animation settings for buttons
const breathAnimationRed = buildBreathAnimation('552200', 'ff0000', 30, 1200);
const breathAnimationGreen = buildBreathAnimation('004411', '00ff00', 30, 1200);
const breathAnimationBlue = buildBreathAnimation('003366', '0000ff', 30, 1200);
const animations = [breathAnimationRed, breathAnimationGreen, breathAnimationBlue];

/*
   Build a 'button down' animation directive.
   The animation will overwrite the default 'button down' animation.
 */
const buildButtonDownAnimationDirective = function(targetGadgets) {
   return {
     "type": "GadgetController.SetLight",
     "version": 1,
     "targetGadgets": targetGadgets,
     "parameters": {
       "animations": [{
         "repeat": 1,
         "targetLights": ["1"],
         "sequence": [{
           "durationMs": 300,
           "color": "FFFF00",
           "blend": false
         }]
       }],
       "triggerEvent": "buttonDown",
       "triggerEventTimeMs": 0
     }
   }
};

// Build a 'button up' animation directive.
const buildButtonUpAnimationDirective = function(targetGadgets) {
   return {
     "type": "GadgetController.SetLight",
     "version": 1,
     "targetGadgets": targetGadgets,
     "parameters": {
       "animations": [{
         "repeat": 1,
         "targetLights": ["1"],
         "sequence": [{
           "durationMs": 300,
           "color": "00FFFF",
           "blend": false
         }]
       }],
       "triggerEvent": "buttonUp",
       "triggerEventTimeMs": 0
     }
   };
};

// Build an idle animation directive.
const buildButtonIdleAnimationDirective = function(targetGadgets, animation) {
   return {
     "type": "GadgetController.SetLight",
     "version": 1,
     "targetGadgets": targetGadgets,
     "parameters": {
       "animations": [{
         "repeat": 100,
         "targetLights": ["1"],
         "sequence": animation
       }],
       "triggerEvent": "none",
       "triggerEventTimeMs": 0
     }
   };
};

/*
    Called when closing the Skill if an InputHandler is active.  We can do this
    because we kept the requestId when we started this InputHandler.  It's always
    a good idea to clean up when your Skill's session ends.
 */
const buttonStopInputHandlerDirective = function(inputHandlerOriginatingRequestId) {
   return {
     "type": "GameEngine.StopInputHandler",
     "originatingRequestId": inputHandlerOriginatingRequestId
   };
};
