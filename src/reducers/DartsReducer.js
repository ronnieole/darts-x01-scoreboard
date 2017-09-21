/*
Store data format:

{
   game: {
      name: "501",
      startScore: 301,
      doubleOut: true/false,
      doubleIn: true/false,
      currentPlayer: 0-x,
      throwCount: 0-x, // number of all throws
      editedCount: 0-x, // number of edited throws
      winner: "", // the name of the winner if the game is over
      winnerStat: "" // the details of the winner, if it is changed, then submitted again
   },
   players: [
       {
           id: "uuid",
           name: "Player name",  // player name
           score: x,             // x to go
           rounds: [
              {// one round containing the throws
               id: "uuid",        // round uuid
               count: 1 - x,      // count of the round
               valid: true/false  // false if the the round was cleared because it was too much
               throws: [
                   { // one throw
                       id: "uuid",
                       num: 0 - 25,      // throw
                       modifier: -1 - 3, // modifier
                   },...
               ],...
             }
           ]
       },...
   ]
}
 */

const mapObject = (object, callback) => {
    return Object.keys(object).map( key => callback(key, object[key]) )
};

export default function reducer(state={
    // ez a defaut state
    game: {
        name: "Not started yet",
        editedCount: 0,
        winner: ""
    },
    players: []
}, action) {

    switch (action.type) {
        case "WIN_GAME": {
            var newGameState = {...state}
            const cp = action.player
            const stat = createStat(cp)
            const param = "winner=" + cp.id + "&round_count=" + cp.rounds.length + "&throw_count=" + stat.throwCount + "&throw_average=" + (stat.sum / stat.throwCount) + "&throw_sum=" + stat.sum
            if (param !== newGameState.game.winnerStat) {
                fetch("http://localhost:9000/command/winGame/1?" + param)
                newGameState.game.winner = cp.name
                newGameState.game.winnerStat = ""
            }
            return newGameState
        }
        case "INSERT_SCORE": {
            return insertThrow({...state}, action.num, action.mod, action.id, 0, action.currentPlayer, action.round);
        }
        case "START_GAME": {
            var config = action.config;
            var ns = {};
            ns["game"] = parseConfig(config.game);
            ns["game"].winner = ""
            ns["game"].editedCount = 0
            ns["players"] = mapObject(config.game.players, (playerId, player) => {
                return {
                    id: player.id,
                    name: player.name,
                    score: ns.game.startScore,
                    rounds: []
                }
            });

            for(var roundNum = 0; roundNum < Object.keys(config.game.players["0"].rounds).length; roundNum++) {
                for(var playerNum = 0; playerNum < Object.keys(config.game.players).length; playerNum++) {
                    if (Object.keys(config.game.players[playerNum].rounds).length > roundNum) {
                        if (Object.keys(config.game.players[playerNum].rounds[roundNum].throws).length > 0) {
                            var throws = config.game.players[playerNum].rounds[roundNum].throws;
                            mapObject(throws, (key, t) => insertThrow(ns, t.score, t.modifier, t.id, t.editedCount, playerNum, roundNum));
                        } else {
                            // this round has no throws
                            ns["players"][playerNum].rounds.push({count:roundNum+1, valid: true, throws:[]});
                        }
                    }
                }
            }
            ns["game"].currentPlayer = config.game.currentPlayer
            return ns;
        }
        default: {
            return {
                ...state
            }
        }
    }
}

function createStat(p) {
    var throwCount = 0
    var sum = 0
    p.rounds.forEach(r => {
        if (r.valid) {
            sum += r.throws.reduce((a, t) => a += t.num * t.mod, 0);
            console.log("throwCount: " + throwCount + " length:" + r.throws.length)
            throwCount += r.throws.length
        }
    });
    return {throwCount: throwCount, sum:sum}
}
function insertThrow(ns, num, mod, id, editedCount, currentPlayerNum, round) {
    ns.game.throwCount++;
    var switchToNextPlayer = false; // switch to next player if this is the third throw
    var roundValid = true;

    if (editedCount > 0) {
        ns.game.editedCount++;
    }

    // store the new throw
    ns.game.currentPlayer = currentPlayerNum
    var currentPlayer = ns.players[ns.game.currentPlayer];
    if (currentPlayer.rounds.length === 0) {
        currentPlayer.rounds.push({count:1, valid: roundValid, throws:[]});
    }
    if (round > 0) {
        while(currentPlayer.rounds.length <= round) {
            currentPlayer.rounds.push({count:currentPlayer.rounds.length, valid: roundValid, throws:[]});
        }
    }
    var currentRound = currentPlayer.rounds[currentPlayer.rounds.length - 1];

    if (mod !== -1) {
        var currentThrow = num * mod;
        if (currentRound.valid) {
            if (currentPlayer.score - currentThrow < 0) {
                roundValid = false;
            }
            if (currentPlayer.score - currentThrow < 2 && ns.game.doubleOut && mod !== 2) {
                roundValid = false;
            }
            if (roundValid === false) {
                if (currentRound.valid) {
                    var roundScore = currentRound.throws.reduce((a, t) => a + (t.num * t.mod), 0);
                    currentPlayer.score += roundScore;
                }
            } else {
                // add the score
                currentPlayer.score -= currentThrow;
            }
        } else {
            roundValid = false;
        }
        currentRound.valid = roundValid;
        currentRound.throws.push({num:num, mod: mod, id: id});
    }

    if (currentRound.throws.length === 3 || mod === -1) { //  || mod === -1
        switchToNextPlayer = true;
    }

    if (switchToNextPlayer) {
        ns.game.currentPlayer = (ns.game.currentPlayer + 1) % ns.players.length;
    }

    return ns;
}

function parseConfig(c) {
    var res = {
        name: "",
        startScore: 0,
        doubleIn: false,
        doubleOut: false,
        currentPlayer: 0,
        throwCount: 0,
        editedCount: 0
    };
    if (c.subtype.includes("701")) {
        res.name="701";
        res.startScore=701;
    }
    if (c.subtype.includes("501")) {
        res.name="501";
        res.startScore=501;
    }
    if (c.subtype.includes("301")) {
        res.name="301";
        res.startScore=301;
    }
    if (c.subtype.includes("doubleOut")) {
        res.doubleOut=true;
        res.name += " Double-Out"
    } else {
        res.doubleOut=false;
    }
    if (c.subtype.includes("doubleIn")) {
        res.doubleIn=true;
        res.name += " Double-In"
    } else {
        res.doubleIn=false;
    }
    return res;
}