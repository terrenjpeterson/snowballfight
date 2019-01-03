// This is the main processing for the Alexa Snowball FIght Skill

'use strict';
const Alexa = require("alexa-sdk");
const appId = 'amzn1.ask.skill.0f8fdbe7-01a2-41d0-877a-c393e543dc58';

// these are the parameters used to perform a roll call with the button
let buttonStartParams = require("data/rollCall.json");

// these are the APL formats for different game states
let aplBeginGame = require("data/aplBeginGame.json");
let aplInProgress = require("data/aplInProgress.json");

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

// scenarios for the game - separate file to make it easier to manage
const scenarios = require("data/scenarios.json");

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
    alexa.appId = appId;

    // log event data for every request
    console.log(JSON.stringify(event));

    // this is for the table that persists session data
    alexa.dynamoDBTableName = 'snowballFight';

    // register handlers
    alexa.registerHandlers(handlers);
    alexa.execute();
};

// these are the handlers associated with different intents
const handlers = {
    'LaunchRequest': function () {
	console.log("Launching new session.");
	let speechOutput = "";
	this.attributes['buttonSkip'] = 0;

        // check for referrer tag
        if (this.event.request.metadata) {
            console.log("Referrer: " + this.event.request.metadata.referrer);
        }

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
	this.attributes['highScore'] = 1;
 	this.attributes['gameOver'] = false;
	this.attributes['scenariosIndex'] = 0;
	this.attributes['gameMode'] = "TBD";
	this.attributes['redScore']  = 0;
	this.attributes['blueScore'] = 0;

        // Build the 'button down' animation for when the button is pressed.
        this.response._addDirective(buildButtonDownAnimationDirective([]));

        if (this.event.context.System.device.supportedInterfaces.Display) {
            console.log("this was requested by an Echo Show");
            //this.response.speak(speechOutput).listen(reprompt).renderTemplate(template);
	    this.response.speak(speechOutput).listen(reprompt);
	    this.response._addDirective(buildAPLDirective(aplBeginGame));
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
	} else if (this.attributes['round'] > 1) {
	    console.log("Inadvertent Yes uttered");
            delete this.handler.response.response.shouldEndSession;
            this.emit(':responseReady');
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

            // change the structure of the APL to reflect in-progress game
            if (this.event.context.System.device.supportedInterfaces.Display) {
            	this.response._addDirective(buildAPLDirective(aplInProgress));
            }

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
        // Don't end the session, and don't open the microphone.
        delete this.handler.response.response.shouldEndSession;
        this.emit(':responseReady');
        //this.emit('AMAZON.StopIntent');
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
	    // check how much of a gap there is between the last button push and handle accordingly
	    if (buttonGap > this.attributes['buttonSkip']) {
	    	this.emit('HandleTimeout');
	    } else {
            	// this is to remove when the timeout occurs around the same time as a successful button push
            	console.log("Skipping false timeout - button was just pushed");
            	// Don't end the session, and don't open the microphone.
            	delete this.handler.response.response.shouldEndSession;
            	this.emit(':responseReady');
	    }
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
	    console.log("Gadget Registered - Timeout Received");
	    if(this.attributes['throwNeeded']) {
                this.emit('ThrowNeeded');
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
    // this logic gets invoked when the time is up and a throw was required based on the scenario
    'ThrowNeeded': function() {
	console.log("Throw needed. Game over.");
               
	// build the audio response to end the game
	let speechOutput = "<audio src='https://s3.amazonaws.com/ask-soundlibrary/foley/amzn_sfx_swoosh_fast_1x_01.mp3'/>" +
	    "<audio src='https://s3.amazonaws.com/ask-soundlibrary/impacts/amzn_sfx_punch_01.mp3'/>" +
	    scenarios[this.attributes['scenariosIndex']].errorMessage + '<break time="1s"/>';
                
	if (this.attributes['gameMode'] === "SOLO") {
	    if (this.attributes['round'] > 1) {
	    	speechOutput = speechOutput + "Thanks for playing!" + '<break time="1s"/>';
	    } else {
		speechOutput = speechOutput + "Remember, press your button to throw a snowball." + '<break time="1s"/>';
	    }
	} else {
            // update the score
            if (this.attributes['redScore'] > this.attributes['blueScore']) {
                speechOutput = speechOutput + "Red won " + this.attributes['redScore'] + " to " + this.attributes['blueScore'];
            } else if (this.attributes['redScore'] < this.attributes['blueScore']) {
                speechOutput = speechOutput + "Blue won " + this.attributes['blueScore'] + " to " + this.attributes['redScore'];
	    } else if (this.attributes['redScore'] === 0 && this.attributes['blueScore'] === 0) {
		speechOutput = speechOutput + "Neither player scored a point. Remember, you need to be quick with your buttons";
            } else {
                speechOutput = speechOutput + "The game tied at " + this.attributes['redScore'];
            }
            speechOutput = speechOutput + "." + '<break time="1s"/>';
	}

	// see if the user wants to try again.
        speechOutput = speechOutput + "Please say 'Start Over' to try again, or say 'Stop' if you are all done.";
	const repeat = "Please say 'Start Over' to begin again, or say 'Stop' if you are done.";

        this.response.speak(speechOutput).listen(repeat);
	this.emit(':responseReady');
	console.log(JSON.stringify(this.response));
    },
    // this handles when a scenario exists where nothing should be thrown
    'GoodNoThrow': function() {
	console.log("No throw required. Continue with another round.");

	// acknowledge that the choice was correct
	let speechOutput = scenarios[this.attributes['scenariosIndex']].successMessage + '<break time="1s"/>';

	// increment the scores
	if (this.attributes['gameMode'] === "SOLO") {
	    this.attributes['round']++;
	} else {
	    this.attributes['redScore']++;
	    this.attributes['blueScore']++;
	}

	// build the message for the next round including a random saying
	const scenariosIndex = Math.floor(Math.random() * scenarios.length);
	console.log("Next Scenario:" + scenariosIndex);

	speechOutput = speechOutput + scenarios[scenariosIndex].description + '<break time="1s"/>';
	let repeatOutput = scenarios[scenariosIndex].description + '<break time="1s"/>';
	this.response.speak(speechOutput).listen(repeatOutput);
	this.attributes['latestScenario'] = scenarios[scenariosIndex].description;

	// save attributes for next event
	this.attributes['throwNeeded'] = scenarios[scenariosIndex].throwNeeded;
	this.attributes['scenariosIndex'] = scenariosIndex;
                
	// extend the lease on the buttons based on the length of the audio in the scenario
	buttonStartParams.timeout = scenarios[scenariosIndex].timeout;
	this.response._addDirective(buttonStartParams);

        // animate buttons based on the game scenario
        if (!this.attributes['redGameOver']) {
            this.response._addDirective(buildButtonIdleAnimationDirective([this.attributes['firstGadgetId']], breathAnimationRed));
        }
        if (!this.attributes['blueGameOver'] && this.attributes['gameMode'] === "SOLO") {
            this.response._addDirective(buildButtonIdleAnimationDirective([this.attributes['secondGadgetId']], breathAnimationBlue));
        }
                
	this.emit(':responseReady');
	console.log(JSON.stringify(this.response));
    },
    // this gets invoked when the first button is pushed during gameplay.
    'FirstButtonPushed': function() {
        console.log("Button Pushed by player one.");

	if (this.attributes['gameOver']) {
	    console.log("Attempt to play a game that is over.");
            this.emit('GameOver');
        } else if (this.attributes['redGameOver'] && this.attributes['gameMode'] === "DUAL") {
            console.log("Red player attempting to play when they are already out");
            delete this.handler.response.response.shouldEndSession;
            this.emit(':responseReady');
        } else if (this.attributes['throwNeeded']) {
	    console.log("Good Hit made.");
	    this.emit('GoodHit', "Red");
        } else {
	    this.emit('SnowballTrouble', "Red");
	}
    },
    // this is executed when the an object is appropriately hit
    'GoodHit': function(player) {
	console.log("Object was appropriately hit by the " + player + " player.");

        // create sounds indicating a hit with the snowball
        let speechOutput = "<audio src='https://s3.amazonaws.com/ask-soundlibrary/foley/amzn_sfx_swoosh_fast_1x_01.mp3'/>" +
            "<audio src='https://s3.amazonaws.com/ask-soundlibrary/impacts/amzn_sfx_punch_01.mp3'/>" +
            '<break time="1s"/>' +
            scenarios[this.attributes['scenariosIndex']].successMessage + '<break time="1s"/>';

	if (this.attributes['gameMode'] === "DUAL") {
	    console.log("Dual player game mode.");
	    // indicate who scored first
	    speechOutput = speechOutput + "The " + player + " player won this round. ";

	    // add to the score based on who won the round
	    if (player === "Red") {
	    	this.attributes['redScore']++;
	    } else {
            	this.attributes['blueScore']++;
	    }

	    // update the score
  	    if (this.attributes['redScore'] > this.attributes['blueScore']) {
	    	speechOutput = speechOutput + "Red is winning " + this.attributes['redScore'] + " to " + this.attributes['blueScore'];
	    } else if (this.attributes['redScore'] < this.attributes['blueScore']) {
            	speechOutput = speechOutput + "Blue is winning " + this.attributes['redScore'] + " to " + this.attributes['blueScore'];
	    } else {
            	speechOutput = speechOutput + "The game is tied at " + this.attributes['redScore'];
	    }
	    speechOutput = speechOutput + "." + '<break time="1s"/>';
	} else {
	    console.log("Single player game mode.");
            // increment the scores
            this.attributes['round']++;
	    speechOutput = speechOutput + "Moving to round " + this.attributes['round'] + "." + '<break time="1s"/>';
        } 

        // build the message for the next round including a random saying
        const scenariosIndex = Math.floor(Math.random() * scenarios.length);
        speechOutput = speechOutput + scenarios[scenariosIndex].description + '<break time="1s"/>';
        let repeat = scenarios[scenariosIndex].description + '<break time="1s"/>';
        this.attributes['latestScenario'] = scenarios[scenariosIndex].description;

        // save attributes for next event
        this.attributes['throwNeeded'] = scenarios[scenariosIndex].throwNeeded;
        this.attributes['scenariosIndex'] = scenariosIndex;

        // extend the lease on the button(s)
        buttonStartParams.timeout = (Number(scenarios[scenariosIndex].timeout) + 2000);
        this.response._addDirective(buttonStartParams);

	// animate buttons based on the game scenario
	if (!this.attributes['redGameOver']) {
            this.response._addDirective(buildButtonIdleAnimationDirective([this.attributes['firstGadgetId']], breathAnimationRed));
	}
	if (!this.attributes['blueGameOver'] && this.attributes['gameMode'] === "SOLO") {
            this.response._addDirective(buildButtonIdleAnimationDirective([this.attributes['secondGadgetId']], breathAnimationBlue));
	}

        this.response.speak(speechOutput).listen(repeat);
        this.emit(':responseReady');
        console.log(JSON.stringify(this.response));
    },
    // this is the function that gets called when the user hits something with a snowball that they weren't supposed to
    'SnowballTrouble': function(player) {
        console.log("Threw a snowball and hit something - game over.");

        // create sounds indicating a smash, negative response, then an intro for the end of game.
        let speechOutput = "<audio src='https://s3.amazonaws.com/ask-soundlibrary/foley/amzn_sfx_swoosh_fast_1x_01.mp3'/>" +
	    "<audio src='https://s3.amazonaws.com/ask-soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_negative_response_02.mp3'/>" +
	    scenarios[this.attributes['scenariosIndex']].errorMessage + '<break time="1s"/>';

	// this round wasn't successful, so decrement so it doesn't count towards high score
	if (this.attributes['gameMode'] === "SOLO") {
	    console.log("Solo player mode.");
	    this.attributes['round'] -= 1;

	    // check if the game was just getting started - redirect user as they might not understand how to play
	    if (this.attributes['round'] > minScore) {
	    	speechOutput = speechOutput + "You were able to get " + this.attributes['round'] + " correct in a row. " +
            	    "<audio src='https://s3.amazonaws.com/ask-soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_outro_01.mp3'/>";
	    } else {
		speechOutput = speechOutput + "You were just getting started, remember, don't press your button every round. ";
	    }

	   this.emit('HandleGameEnding', speechOutput);
	} else {
	    // dual mode - need to check if both players are out, or just one of them
	    console.log("Game Over for " + player + " player.");
	    if (player === "Red") {
		if(this.attributes['blueGameOver']) {
	   	    this.emit('HandleGameEnding', speechOutput);
		} else {
		    this.emit('HandleKnockout', speechOutput, player);
		}
	    } else {
		// assume player is blue
		if(this.attributes['redGameOver']) {
                    this.emit('HandleGameEnding', speechOutput);
		} else {
                    this.emit('HandleKnockout', speechOutput, player);
		}
	    }
	}
    },
    // this handles when one of the players gets knocked out of the game
    'HandleKnockout': function(speechOutput, player) {
	console.log("Setup Remainder of the game");

	speechOutput = speechOutput + "The " + player + " is no longer in the game." + '<break time="1s"/>';

        // build the message for the next round including a random saying
        const scenariosIndex = Math.floor(Math.random() * scenarios.length);
        speechOutput = speechOutput + scenarios[scenariosIndex].description + '<break time="1s"/>';
        let repeat = scenarios[scenariosIndex].description + '<break time="1s"/>';
        this.attributes['latestScenario'] = scenarios[scenariosIndex].description;

        // save attributes for next event
        this.attributes['throwNeeded'] = scenarios[scenariosIndex].throwNeeded;
        this.attributes['scenariosIndex'] = scenariosIndex;

        // extend the lease on the buttons and reanimate both buttons
        buttonStartParams.timeout = (Number(scenarios[scenariosIndex].timeout) + 2000);
        this.response._addDirective(buttonStartParams);

	// only illuminate the remaining player
	if (player === "Blue") {
            this.response._addDirective(buildButtonIdleAnimationDirective([this.attributes['firstGadgetId']], breathAnimationRed));
            this.response._addDirective(buildButtonIdleAnimationDirective([this.attributes['secondGadgetId']], breathAnimationBlack));	
	    this.attributes['blueGameOver'] = true;
	} else {
            this.response._addDirective(buildButtonIdleAnimationDirective([this.attributes['firstGadgetId']], breathAnimationBlack));
            this.response._addDirective(buildButtonIdleAnimationDirective([this.attributes['secondGadgetId']], breathAnimationBlue));
	    this.attributes['redGameOver'] = true;
	}

        this.response.speak(speechOutput).listen(repeat);
        this.emit(':responseReady');
        console.log(JSON.stringify(this.response));
    },
    // this handles processing the end of a game
    'HandleGameEnding': function(speechOutput) {
	console.log("Process End of Game");

        if (this.attributes['gameMode'] === "SOLO") {
	    speechOutput = speechOutput + "You scored " + this.attributes['round'] + " in this game." + '<break time="1s"/>';

            // check for high score
            if (this.attributes['round'] > this.attributes['highScore']) {
            	console.log("New High Score");
            	this.attributes['highScore'] = this.attributes['round'];
            	if (this.attributes['round'] > minScore) {
            	    speechOutput = speechOutput + "Congratulations on a new high score! ";
            //      if (this.attributes['round'] > expertLevel) {
            //          speechOutput = speechOutput + "You made it to the expert level animal saving crew! ";
            //      } else if (this.attributes['round'] > starLevel) {
            //          speechOutput = speechOutput + "You made it to the star level animal saving team! ";
            //      } else if (this.attributes['round'] > advancedLevel) {
            //          speechOutput = speechOutput + "You are an advanced animal rescuer! ";
            //      }
                }
            }
        } else {
            // read off the final score
            if (this.attributes['redScore'] > this.attributes['blueScore']) {
                speechOutput = speechOutput + "Red won " + this.attributes['redScore'] + " to " + this.attributes['blueScore'];
            } else if (this.attributes['redScore'] < this.attributes['blueScore']) {
                speechOutput = speechOutput + "Bue won " + this.attributes['blueScore'] + " to " + this.attributes['redScore'];
            } else {
                speechOutput = speechOutput + "The game tied at " + this.attributes['redScore'];
            }
            speechOutput = speechOutput + "." + '<break time="1s"/>';
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
    // this is the logic that gets invoked when the blue button is pressed in a two player game
    'SecondButtonPushed': function() {
        console.log("Second player button pushed.");

        if (this.attributes['gameOver']) {     
            console.log("Attempting to play a game that is over.");
	    this.emit('GameOver');
	} else if (this.attributes['blueGameOver']) {
	    console.log("Blue player attempting to play when they are already out");
            delete this.handler.response.response.shouldEndSession;
            this.emit(':responseReady');
        } else {
	    if (this.attributes['throwNeeded']) {
	    	console.log("Player Two hit the object.");
            	this.emit('GoodHit', "Blue");
	    } else {
		console.log("Player Two threw when they shouldn't.");
		this.emit('SnowballTrouble', "Blue");
	    }
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
        console.log("Second button registered - ready to begin two player game.");

	// change the structure of the APL to reflect in-progress game
        if (this.event.context.System.device.supportedInterfaces.Display) {
            this.response._addDirective(buildAPLDirective(aplInProgress));
        }

	// set the default attributes to begin the game
	this.attributes['gameMode'] = "DUAL";
	this.attributes['redScore']  = 0;
	this.attributes['blueScore'] = 0;
	this.attributes['blueGameOver'] = false;
        this.attributes['redGameOver'] = false;

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

        // extend the lease on the buttons for 40 seconds - this is now game mode
	buttonStartParams.timeout = 40000;
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
        const speechOutput = "Sorry, someone is already using that button. Please pick another button to use."; 
        const repeat = "Please press a second button, then we can get started with the game.";

        console.log("Same button picked a second time");

        this.response.speak(speechOutput).listen(repeat);
	this.emit(':responseReady');
    },    
    // this is the function that gets invoked when help is requested
    'AMAZON.HelpIntent': function () {
        let speechOutput = "The object of the game is to knock down as many things as possible with snowballs. " +
            "Just listen carefully to the scenario that are being played. " +
	    "Remember, you don't have unlimited time so if you're not fast enough you may get hit by a snowball. " +
	    '<break time="1s"/>' + "There is also an option for a two player game. " +
	    "Just press two buttons and there will be a red player and a blue player. " + '<break time="1s"/>' +
            "Outscore your opponent to win the game. " + '<break time="1s"/>';
        let reprompt = "";

        if (this.attributes['latestScenario']) {
            speechOutput = speechOutput + "Here is the latest scenario. " + this.attributes['latestScenario'];
            reprompt = "Here is the latest scenario. Go ahead and either smash or save. " + this.attributes['latestScenario'];
        } else {
            speechOutput = speechOutput + "You are currently setting up to begin a game. ";
            reprompt = "Please an Echo button if you have them, else say no to begin the game. ";
        }

        // extend the lease on the buttons so they don't time out
        buttonStartParams.timeout = 60000;;
        this.response._addDirective(buttonStartParams);

        this.response.speak(speechOutput).listen(reprompt);
        this.emit(':responseReady');
    },
    // if the user decides to start over during a game, this intent gets invoked and the score resets
    'AMAZON.StartOverIntent': function () {
        console.log("Start Over Requested");

        // reset the score
        this.attributes['originatingRequestId'] = this.event.request.requestId;
        this.attributes['gameOver'] = false;
        this.attributes['scenariosIndex'] = 0;

	if (this.attributes['gameMode'] === "SOLO") {
            this.attributes['round'] = 1;
	} else {
            this.attributes['redScore']  = 0;
            this.attributes['blueScore'] = 0;
            this.attributes['blueGameOver'] = false;
            this.attributes['redGameOver'] = false;
	}

        let speechOutput = "New game. Now let's get ready to play. " + '<break time="1s"/>' +
            "<audio src='https://s3.amazonaws.com/ask-soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_intro_01.mp3'/>" +
            '<break time="1s"/>';
        
        // create the initial audio to stage the game
        speechOutput = speechOutput + "You walk outside, and it's a beautiful winter day! " +
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

	// reanimate buttons depending on game mode
        this.response._addDirective(buildButtonIdleAnimationDirective([this.attributes['firstGadgetId']], breathAnimationRed));
	if (this.attributes['gameMode'] === "DUAL") {
            this.response._addDirective(buildButtonIdleAnimationDirective([this.attributes['secondGadgetId']], breathAnimationBlue));
	}

        this.response.speak(speechOutput).listen(repeatOutput);
	this.emit(':responseReady');        
    },
    'AMAZON.CancelIntent': function () {
        this.response.speak("Goodbye");
        this.emit(':responseReady');
    },
    // this processes when the game has exited per the users request
    'AMAZON.StopIntent': function () {
	console.log("Stopped Game");

        let speechOutput = "";

        // check for high score - this will only get invoked if user quits on a 'winning streak'
        if (this.attributes['round'] > this.attributes['highScore']) {
            console.log("New High Score");
            this.attributes['highScore'] = this.attributes['round'];
	    speechOutput = speechOutput + "Great job on the new high score of " + this.attributes['round'] + ".";
        }

        if (this.attributes['gameMode'] === "SOLO") {
            speechOutput = speechOutput + "Thanks for playing!";
	} else if (this.attributes['gameMode'] === "TBD") {
            speechOutput = speechOutput + "Thanks for trying!";	
        } else {
            // assume the game is in DUAL mode - provide a final score update
	    if (this.attributes['redScore'] === 0 && this.attributes['blueScore'] === 0) {
                speechOutput = speechOutput + "Thanks for trying!";
            } else if (this.attributes['redScore'] > this.attributes['blueScore']) {
                speechOutput = speechOutput + "Red won " + this.attributes['redScore'] + " to " + this.attributes['blueScore'];
            } else if (this.attributes['redScore'] < this.attributes['blueScore']) {
                speechOutput = speechOutput + "Blue won " + this.attributes['blueScore'] + " to " + this.attributes['redScore'];
            } else {
                speechOutput = speechOutput + "The game tied at " + this.attributes['redScore'];
            }
            speechOutput = speechOutput + "." + '<break time="1s"/>';
        }

	// in case gadgets were used, reset them in the session
        this.attributes['firstGadgetId'] = null;
        this.attributes['secondGadgetId'] = null;

	// create response to the user
        this.response.speak(speechOutput);
        this.emit(':responseReady');
        console.log(JSON.stringify(this.response));
    },
    'AMAZON.FallbackIntent': function () {
        console.log("Fallback Intent hit.");
        let speechOutput = "Sorry, I didn't understand that request. ";
        let reprompt = "";        

	if (this.attributes['latestScenario']) {
            speechOutput = speechOutput + "Here is the latest sound. " + this.attributes['latestScenario'] +
                scenarios[this.attributes['scenariosIndex']].description;
            reprompt = "Here is the latest sound. " + this.attributes['latestScenario'] +
		scenarios[this.attributes['scenariosIndex']].description;
        } else {
            speechOutput = speechOutput + "You are currently setting up buttons to begin a game. ";
            reprompt = "Please press two Echo buttons if you want to play the Snowball Fight game.";
        }

        this.response.speak(speechOutput).listen(reprompt);
        this.emit(':responseReady');
        console.log(JSON.stringify(this.response));
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
const breathAnimationBlack = buildBreathAnimation('000000', '000000', 30, 1200);
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

// Build an APL directive
const buildAPLDirective = function(aplData) {
    const currentView = {};

    console.log(currentView);
    console.log(JSON.stringify(currentView));

    return {
	"type": "Alexa.Presentation.APL.RenderDocument",
	"document": aplData,
	"dataSources": currentView
    };
};
