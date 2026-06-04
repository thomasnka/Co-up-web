"use strict";
/// <reference path="d/js.d.ts" />
/// <reference path="Game.Entities.ts" />
String.prototype.format = function () {
    var args = arguments;
    return this.replace(/{(\d+)}/g, function (match, index) { return typeof args[index] != 'undefined'
        ? args[index]
        : match; });
};
var Game;
(function (Game) {
    var Helper = /** @class */ (function () {
        function Helper() {
        }
        Helper.htmlEncode = function (value) {
            //create a in-memory div, set it's inner text(which jQuery automatically encodes)
            //then grab the encoded contents back out.  The div never exists on the page.
            return $('<div/>').text(value).html();
        };
        Helper.htmlDecode = function (value) {
            return $('<div/>').html(value).text();
        };
        Helper.swap = function (elm1, elm2) {
            var parent1 = elm1.parentNode;
            var next1 = elm1.nextSibling;
            var parent2 = elm2.parentNode;
            var next2 = elm2.nextSibling;
            parent1.insertBefore(elm2, next1);
            parent2.insertBefore(elm1, next2);
        };
        Helper.first = function (arr, condition) {
            for (var i = 0; i < arr.length; i++) {
                if (condition(arr[i])) {
                    return arr[i];
                }
            }
            return null;
        };
        Helper.log = function (str) {
            var args = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                args[_i - 1] = arguments[_i];
            }
            if (!this.logging) {
                return;
            }
            if (typeof (window.console) === "undefined") {
                return;
            }
            if (window.console.log) {
                var m = "[" + new Date().toTimeString() + "] : " + str.format.apply(str, args);
                window.console.log(m);
            }
        };
        Helper.error = function (e, data) {
            window.console.error(e, data);
        };
        Helper.noti = function (msg, error) {
            if (error) {
                toastr.error(msg, null, { timeOut: 0, tapToDismiss: false });
            }
            else {
                toastr.info(msg);
            }
        };
        Helper.isSoundMuted = function () {
            try {
                return window.localStorage.getItem(Helper.soundMutedKey) === "true";
            }
            catch (e) {
                return false;
            }
        };
        Helper.setSoundMuted = function (muted) {
            try {
                window.localStorage.setItem(Helper.soundMutedKey, muted ? "true" : "false");
            }
            catch (e) {
                // Ignore private-mode storage failures; sound can still work for this page load.
            }
        };
        Helper.getSoundVolume = function () {
            try {
                var raw = window.localStorage.getItem(Helper.soundVolumeKey);
                var volume = raw == null ? 0.85 : parseFloat(raw);
                if (isNaN(volume)) {
                    return 0.85;
                }
                return Math.max(0, Math.min(1, volume));
            }
            catch (e) {
                return 0.85;
            }
        };
        Helper.setSoundVolume = function (value) {
            var volume = parseFloat(value);
            if (isNaN(volume)) {
                volume = 0.85;
            }
            if (volume > 1) {
                volume = volume / 100;
            }
            volume = Math.max(0, Math.min(1, volume));
            try {
                window.localStorage.setItem(Helper.soundVolumeKey, volume.toString());
            }
            catch (e) {
                // Ignore private-mode storage failures; sound can still work for this page load.
            }
            return volume;
        };
        Helper.playGameSound = function (name) {
            var volume = Helper.getSoundVolume();
            if (Helper.isSoundMuted() || volume <= 0) {
                return;
            }
            try {
                var source = $('[data-sound="' + name + '"]')[0];
                var audio;
                if (source) {
                    audio = source.cloneNode(true);
                }
                else {
                    audio = new Audio("/sounds/" + name + ".mp3");
                }
                audio.volume = volume;
                var promise = audio.play();
                if (promise && promise.catch) {
                    promise.catch(function () { return undefined; });
                }
            }
            catch (e) {
                Helper.error(e, ["playGameSound", name]);
            }
        };
        // Browsers gate audio.play() behind a user gesture (Chrome's autoplay
        // policy, Safari's similar restriction). For spectators who land on
        // /game/<id> directly, the first playGameSound("move") call comes
        // from a SignalR callback — not a user gesture — so it's blocked and
        // the audio context stays "asleep" for the rest of the page. This
        // primer registers capture-phase listeners for user gestures and,
        // on each one, attempts to play a REAL audio asset (/sounds/move.mp3)
        // inside the gesture context. An empty `new Audio()` rejects with
        // NotSupportedError and does not unlock the media pipeline, so the
        // play target must be a file the browser can actually decode.
        // audioPrimed is only set true after play() RESOLVES — on rejection
        // the listeners stay so the next gesture retries.
        Helper.primeAudio = function () {
            try {
                if (Helper.audioPrimed)
                    return;
                var events = ['click', 'touchstart', 'keydown', 'pointerdown'];
                var prime = function () {
                    if (Helper.audioPrimed) {
                        cleanup();
                        return;
                    }
                    try {
                        var a = new Audio('/sounds/move.mp3');
                        a.muted = true;
                        a.volume = 0;
                        var p = a.play();
                        if (p && p.then) {
                            p.then(function () {
                                Helper.audioPrimed = true;
                                cleanup();
                            }).catch(function () { });
                        }
                        else {
                            Helper.audioPrimed = true;
                            cleanup();
                        }
                    }
                    catch (e) { /* keep listeners */ }
                };
                var cleanup = function () {
                    events.forEach(function (ev) {
                        document.removeEventListener(ev, prime, true);
                    });
                };
                events.forEach(function (ev) {
                    document.addEventListener(ev, prime, true);
                });
            }
            catch (e) { /* pre-DOM-ready or otherwise — swallow */ }
        };
        Helper.soundNoti = function () {
            Helper.playGameSound("join");
        };
        Helper.getName = function (username) {
            return username.lastIndexOf("-") > 0 ? i18n.Anonymous : username;
        };
        Helper.isAnon = function (username) {
            return username.lastIndexOf("-") > 0;
        };
        Helper.selectElement = function (element) {
            if (window.getSelection) {
                var sel = window.getSelection();
                sel.removeAllRanges();
                var range = document.createRange();
                range.selectNodeContents(element);
                sel.addRange(range);
            }
        };
        Helper.showResultMessage = function (msg) {
            if (Helper.messageResultVm == null) {
                Helper.messageResultVm = new Game.Message();
                Helper.messageResultVm.title = ko.observable(msg.titleText);
                Helper.messageResultVm.content = ko.observable(msg.contentText);
                Helper.messageResultVm.dismiss = ko.observable(msg.dismissable);
                Helper.messageResultVm.commands = ko.observableArray();
                Helper.messageResultVm.win = ko.observable(false);
                ko.applyBindings(Helper.messageResultVm, $('#result')[0]);
            }
            //set values
            Helper.messageResultVm.title(msg.titleText);
            Helper.messageResultVm.content(msg.contentText);
            Helper.messageResultVm.dismiss(msg.dismissable);
            Helper.messageResultVm.win(msg.winValue);
            //update commands
            Helper.messageResultVm.commands.removeAll();
            if (msg.commandList) {
                var i;
                for (i in msg.commandList) {
                    Helper.messageResultVm.commands.push(msg.commandList[i]);
                }
            }
            $('#result').show();
        };
        Helper.goBack = function () {
            window.location.href = "/";
        };
        Helper.requesting = function (begin) {
            if (begin) {
                if (Helper.timeoutRequesting) {
                    clearTimeout(Helper.timeoutRequesting);
                }
                Helper.timeoutRequesting = setTimeout(function () {
                    NProgress.start();
                }, 200);
            }
            else {
                NProgress.done();
                if (Helper.timeoutRequesting) {
                    clearTimeout(Helper.timeoutRequesting);
                    Helper.timeoutRequesting = null;
                }
            }
        };
        Helper.logging = true;
        Helper.messageResultVm = null;
        Helper.soundMutedKey = "xq.sound.muted";
        Helper.soundVolumeKey = "xq.sound.volume";
        Helper.audioPrimed = false;
        return Helper;
    }());
    Game.Helper = Helper;
})(Game || (Game = {}));
"use strict";
var Game;
(function (Game) {
    //client classes
    var Command = /** @class */ (function () {
        function Command(template, action, countdown, stop) {
            if (countdown === void 0) { countdown = -1; }
            if (stop === void 0) { stop = null; }
            var _this = this;
            this.template = template;
            this.command = function () {
                if (action) {
                    action();
                }
                if (!_this.preventAutoHide) {
                    Command.stop();
                }
                if (stop) {
                    stop();
                }
            };
            this.countdown = countdown;
            this.bindText();
        }
        Command.stop = function () {
            if (Message.timer) {
                clearInterval(Message.timer);
            }
            //Helper.hideMessage();
        };
        Command.prototype.bindText = function () {
            var _this = this;
            if (this.countdown < 0) {
                this.text = ko.observable(this.template);
                return;
            }
            this.text = ko.observable(this.template.format(Math.ceil(this.countdown / 1000)));
            //start timer to update template every seconds
            Message.timer = setInterval(function () {
                _this.countdown -= 1000;
                if (_this.countdown > 0) {
                    _this.text(_this.template.format(Math.ceil(_this.countdown / 1000)));
                }
                else {
                    clearInterval(Message.timer);
                    _this.command();
                }
            }, 1000);
        };
        return Command;
    }());
    Game.Command = Command;
    var Message = /** @class */ (function () {
        function Message() {
        }
        Message.generate = function (titleText, contentText, contentFormat, commands, altContentFormat) {
            var msg = new Message();
            msg.titleText = titleText;
            msg.contentText = contentText;
            msg.contentFormat = contentFormat;
            msg.commandList = commands;
            msg.altContentFormat = altContentFormat;
            return msg;
        };
        return Message;
    }());
    Game.Message = Message;
})(Game || (Game = {}));
"use strict";
/// <reference path="d/entities.d.ts" />
var Game;
(function (Game) {
    var Sound = /** @class */ (function () {
        function Sound() {
        }
        Sound.getMoveSoundState = function (result) {
            var check = result.moveType === 3 /* MoveType.Check */ ||
                result.moveType === 4 /* MoveType.Checkmate */;
            var eat = !check && result.eat != null;
            return {
                check: check,
                eat: eat,
                name: check ? "check" : eat ? "eat" : "move",
            };
        };
        return Sound;
    }());
    Game.Sound = Sound;
})(Game || (Game = {}));
"use strict";
/// <reference path="../d/entities.d.ts" />
/// <reference path="../d/jquery.d.ts" />
/// <reference path="../d/knockout.d.ts" />
/// <reference path="../Game.Helper.ts" />
var Game;
(function (Game) {
    var Models;
    (function (Models) {
        var ActionModel = /** @class */ (function () {
            function ActionModel(joinHandler, resignHandler, drawHandler, withdrawHandler, rematchHandler, quitHandler) {
                var _this = this;
                this.joinable = ko.observable(false);
                this.resignable = ko.observable(false);
                this.drawable = ko.observable(false);
                this.withdrawable = ko.observable(false);
                this.viewerOnly = ko.observable(false);
                //rematch...
                this.textRematch = ko.observable(i18n.Rematch);
                this.canRematch = ko.observable(false);
                this.showRematch = ko.observable(false);
                this.flipable = ko.observable(false) /*only show flip button for viewers*/;
                this.soundMuted = ko.observable(Game.Helper.isSoundMuted());
                this.soundVolume = ko.observable(Math.round(Game.Helper.getSoundVolume() * 100));
                this.drawCalling = false;
                this.endGame = false;
                this.joinHandler = joinHandler;
                this.resignHandler = resignHandler;
                this.drawHandler = drawHandler;
                this.withdrawHandler = withdrawHandler;
                this.rematchHandler = rematchHandler;
                this.quitHandler = quitHandler;
                this.$element = $('[data-role="action"]');
                ko.applyBindings(this, this.$element[0]);
                this.resultVm = {
                    title: ko.observable(""),
                    redName: ko.observable(""),
                    redScore: ko.observable(""),
                    blackName: ko.observable(""),
                    blackScore: ko.observable(""),
                    win: ko.observable(false),
                    lose: ko.observable(false),
                    playing: ko.observable(false),
                    rematchClick: function () { return _this.rematchClick(); },
                };
                this.$result = $("#result-modal");
                ko.applyBindings(this.resultVm, this.$result[0]);
                this.resignVm = {
                    confirmResignClick: function () { return _this.resignHandler(); },
                };
                this.$resign = $("#resign-modal");
                ko.applyBindings(this.resignVm, this.$resign[0]);
            }
            ActionModel.prototype.joined = function (playing, gameInfo) {
                this.playing = playing;
                this.myColor = gameInfo.myColor;
                this.updatePlayers(gameInfo.players);
                this.setViewerOnly(!playing);
                if (!this.playing) {
                    this.flipable(true);
                    this.$element.removeClass("invisible");
                    return;
                }
                //reset live-only controls — joined() can run again on reconnect; without
                //this, stale Resign/Draw/Withdraw stay enabled when reconnecting into
                //a non-Running state (Ended, New, Ready)
                this.resignable(false);
                this.drawable(false);
                this.withdrawable(false);
                if (gameInfo.roomState === 3 /* RoomState.Running */) {
                    this.resignable(true);
                    //check for show draw/withdraw button
                    var player = Game.Helper.first(gameInfo.players, function (t) { return t.color === gameInfo.myColor; });
                    if (player != null) {
                        this.drawable(!player.drawRequested);
                        this.withdrawable(player.drawRequested);
                    }
                }
                this.joinable(false);
                //rematch
                this.showRematch(gameInfo.roomState === 4 /* RoomState.Ended */);
                this.canRematch(this.showRematch());
                this.flipable(false);
                this.$element.removeClass("invisible");
            };
            ActionModel.prototype.ready = function (playing, myColor, players) {
                this.playing = playing;
                this.myColor = myColor;
                this.endGame = false;
                this.updatePlayers(players);
                this.setViewerOnly(!playing);
                this.joinable(false);
                this.resignable(false);
                this.drawable(false);
                this.withdrawable(false);
                this.showRematch(false);
                this.flipable(!playing);
                this.$result.modal("hide");
            };
            ActionModel.prototype.start = function () {
                this.setViewerOnly(!this.playing);
                if (!this.playing)
                    return;
                if (this.playing) {
                    this.resignable(true);
                    this.drawable(true);
                }
            };
            ActionModel.prototype.ended = function (result) {
                this.endGame = true;
                this.setViewerOnly(!this.playing);
                if (this.playing) {
                    this.resignable(false);
                    this.drawable(false);
                    this.withdrawable(false);
                    this.textRematch(i18n.Rematch);
                    this.canRematch(true);
                    this.showRematch(true);
                }
                this.resultVm.redScore(result.redScore > 0 ? "+" + result.redScore : result.redScore + "");
                this.resultVm.blackScore(result.blackScore > 0 ? "+" + result.blackScore : result.blackScore + "");
                this.resultVm.playing(this.playing);
                this.resultVm.lose(false);
                this.resultVm.win(false);
                if (result.winnerColor) {
                    if (this.playing) {
                        if (this.myColor === result.winnerColor) {
                            this.resultVm.title(i18n.Victorious);
                            this.resultVm.win(true);
                        }
                        else {
                            this.resultVm.title(i18n.Lose);
                            this.resultVm.lose(true);
                        }
                    }
                    else {
                        this.resultVm.title(i18n.GameEndFormat.format(result.winnerColor === 1 /* PieceColor.Red */ ? i18n.Red : i18n.Black));
                    }
                }
                else {
                    this.resultVm.title(i18n.GameDraw);
                }
                gtag("event", "game", { event_category: "ended" });
                this.showResultAfterResignClosed();
            };
            // The resign-confirm modal may still be visible (or in its opening
            // transition) when the game ends — e.g. the opponent resigns or this
            // player's clock expires while their own resign-confirm prompt is up.
            // Bootstrap 5.2.2's imperative Modal.show() does NOT auto-hide an
            // already-open modal (only the data-api click path does), and
            // Modal.hide() is a no-op while _isTransitioning is true. If we just
            // called $result.modal("show") here, both modals could coexist with the
            // later one in DOM order intercepting clicks on the result buttons.
            //
            // Orchestrated sequence:
            //   1) resign not visible → show result directly.
            //   2) resign visible → request resign.hide(); defer result.show() until
            //      the hidden.bs.modal event fires.
            //   3) safety fallback: if hide() races with an in-flight opening
            //      transition and gets ignored, retry once after Bootstrap's
            //      ~200ms transition window, and finally show result unconditionally
            //      after 1s so the user is never stuck behind a stale resign modal.
            ActionModel.prototype.showResultAfterResignClosed = function () {
                var _this = this;
                var showResult = function () {
                    if (showResult.done)
                        return;
                    showResult.done = true;
                    // Defensive sweep: when the 1s safety fallback fires, Bootstrap may
                    // have left orphan .modal-backdrop nodes from the resign-modal that
                    // would otherwise intercept clicks on the result modal's buttons —
                    // including "Chơi lại". Strip any backdrop that does not have an
                    // owning modal currently open, then reset body state before showing.
                    $(".modal-backdrop").each(function () {
                        if (!$(".modal.show").length) $(this).remove();
                    });
                    if (!$(".modal.show").length) {
                        $("body").removeClass("modal-open").css("padding-right", "");
                    }
                    _this.$result.modal("show");
                };
                if (!this.$resign.is(":visible")) {
                    showResult();
                    return;
                }
                this.$resign.one("hidden.bs.modal", showResult);
                this.$resign.modal("hide");
                setTimeout(function () { if (!showResult.done)
                    _this.$resign.modal("hide"); }, 300);
                setTimeout(showResult, 1000);
            };
            ActionModel.prototype.leave = function () {
                if (!this.playing) {
                    this.setViewerOnly(true);
                }
                else {
                    this.showRematch(false);
                }
            };
            ActionModel.prototype.destroyed = function () {
                this.joinable(false);
                this.showRematch(false);
                this.setViewerOnly(!this.playing);
            };
            ActionModel.prototype.setViewerOnly = function (viewerOnly) {
                this.viewerOnly(viewerOnly);
                if (viewerOnly) {
                    this.joinable(false);
                    this.resignable(false);
                    this.drawable(false);
                    this.withdrawable(false);
                    this.showRematch(false);
                    this.canRematch(false);
                }
            };
            ActionModel.prototype.joinClick = function () {
                gtag("event", "game", { event_category: "join" });
                this.joinHandler();
            };
            ActionModel.prototype.resignClick = function () {
                gtag("event", "game", { event_category: "resign" });
                this.$resign.modal("show");
            };
            ActionModel.prototype.drawClick = function () {
                var _this = this;
                gtag("event", "game", { event_category: "draw" });
                if (this.drawCalling)
                    return;
                this.drawCalling = true;
                try {
                    this.drawHandler()
                        .then(function (r) {
                        if (r && !_this.endGame) {
                            _this.drawable(false);
                            _this.withdrawable(true);
                        }
                    })
                        .finally(function () {
                        _this.drawCalling = false;
                    });
                }
                catch (e) {
                    this.drawCalling = false;
                    console.log("call draw exception");
                }
            };
            ActionModel.prototype.withdrawClick = function () {
                var _this = this;
                gtag("event", "game", { event_category: "withdraw" });
                if (this.drawCalling)
                    return;
                this.drawCalling = true;
                try {
                    this.withdrawHandler()
                        .then(function (r) {
                        if (r && !_this.endGame) {
                            _this.withdrawable(false);
                            _this.drawable(true);
                        }
                    })
                        .finally(function () {
                        _this.drawCalling = false;
                    });
                }
                catch (e) {
                    this.drawCalling = false;
                }
            };
            ActionModel.prototype.rematchClick = function () {
                gtag("event", "game", { event_category: "rematch" });
                this.canRematch(false);
                this.textRematch(i18n.Rematching);
                // Close the result modal explicitly. Previously the modal's "Chơi lại"
                // button used data-bs-dismiss="modal" plus this knockout click handler,
                // which left a small race window where Bootstrap's data-api close could
                // tear down state mid-flight and leave an orphan .modal-backdrop that
                // intercepted subsequent taps. Closing it here, after the rematch
                // request has been queued, removes the race entirely.
                if (this.$result.hasClass("show")) this.$result.modal("hide");
                this.rematchHandler();
            };
            ActionModel.prototype.quitClick = function () {
                gtag("event", "game", { event_category: "quit" });
                this.quitHandler();
            };
            ActionModel.prototype.flipClick = function () { };
            ActionModel.prototype.soundToggleClick = function () {
                var muted = !this.soundMuted();
                Game.Helper.setSoundMuted(muted);
                this.soundMuted(muted);
                if (!muted && parseFloat(this.soundVolume()) <= 0) {
                    this.soundVolume(85);
                    Game.Helper.setSoundVolume(85);
                }
                if (!muted) {
                    Game.Helper.playGameSound("move");
                }
                gtag("event", "game", {
                    event_category: "sound_toggle",
                    event_label: muted ? "muted" : "enabled",
                });
            };
            ActionModel.prototype.soundVolumeInput = function () {
                var volume = Game.Helper.setSoundVolume(this.soundVolume());
                this.soundVolume(Math.round(volume * 100));
                this.soundMuted(volume <= 0);
                Game.Helper.setSoundMuted(volume <= 0);
            };
            ActionModel.prototype.updatePlayers = function (players) {
                //set result
                var red = Game.Helper.first(players, function (p) { return p.color === 1 /* PieceColor.Red */; });
                if (red) {
                    this.resultVm.redName(Game.Helper.getName(red.username));
                }
                var black = Game.Helper.first(players, function (p) { return p.color === 2 /* PieceColor.Black */; });
                if (black) {
                    this.resultVm.blackName(Game.Helper.getName(black.username));
                }
            };
            return ActionModel;
        }());
        Models.ActionModel = ActionModel;
    })(Models = Game.Models || (Game.Models = {}));
})(Game || (Game = {}));
"use strict";
var Game;
(function (Game) {
    var Models;
    (function (Models) {
        var PlayerModel = /** @class */ (function () {
            function PlayerModel() {
                this.rotated = false;
                this.alertFromSeconds = 10;
                this.models = {};
                this.elements = {};
                this.elements[2 /* PieceColor.Black */] = $('[data-player="black"]')[0];
                this.elements[1 /* PieceColor.Red */] = $('[data-player="red"]')[0];
                this.models[2 /* PieceColor.Black */] = this.getUser();
                this.models[1 /* PieceColor.Red */] = this.getUser();
                ko.applyBindings(this.models[2 /* PieceColor.Black */], this.elements[2 /* PieceColor.Black */]);
                ko.applyBindings(this.models[1 /* PieceColor.Red */], this.elements[1 /* PieceColor.Red */]);
            }
            PlayerModel.prototype.joined = function (playing, gameInfo) {
                var _this = this;
                this.myColor = gameInfo.myColor;
                this.playing = playing;
                //rotating
                if (this.myColor === 2 /* PieceColor.Black */ && !this.rotated ||
                    this.myColor === 1 /* PieceColor.Red */ && this.rotated) {
                    this.rotate();
                }
                gameInfo.players.forEach(function (player) {
                    _this.setPlayer(player);
                    _this.changeState(player.username, player.state);
                });
                if (gameInfo.token) {
                    this.tokenLink = "/join?token=" + gameInfo.token;
                    if (gameInfo.players.length === 1) {
                        this.showInvite();
                    }
                }
                //store early turn time for new game later
                this.timeEarlyTurn = gameInfo.earlyTurnTime;
                //update when room is ready/running; otherwise (re-join into New/Ended)
                //clear any stale live-timer state — joined() can run again on reconnect
                if (gameInfo.roomState === 2 /* RoomState.Ready */ || gameInfo.roomState === 3 /* RoomState.Running */) {
                    this.updateTime(gameInfo.turnColor, gameInfo.turnRemain);
                }
                else {
                    if (this.timerTurn) {
                        clearInterval(this.timerTurn);
                        this.timerTurn = null;
                    }
                    this.endAlert();
                    this.models[1 /* PieceColor.Red */].turnTime('');
                    this.models[1 /* PieceColor.Red */].running(false);
                    this.models[2 /* PieceColor.Black */].turnTime('');
                    this.models[2 /* PieceColor.Black */].running(false);
                }
                if (gameInfo.players.length === 2) {
                    document.title = "{0} vs {1}".format(Game.Helper.getName(this.models[1 /* PieceColor.Red */].u), Game.Helper.getName(this.models[2 /* PieceColor.Black */].u));
                }
                else {
                    document.title = i18n.TitleWaitingFormat.format(Game.Helper.getName(gameInfo.players[0].username));
                }
            };
            PlayerModel.prototype.ready = function (playing, myColor, players, newPlayer) {
                var _this = this;
                this.myColor = myColor;
                this.playing = playing;
                players.forEach(function (player) {
                    _this.setPlayer(player);
                });
                document.title = "{0} vs {1}".format(Game.Helper.getName(this.models[1 /* PieceColor.Red */].u), Game.Helper.getName(this.models[2 /* PieceColor.Black */].u));
                //rotating
                if (this.myColor === 2 /* PieceColor.Black */ && !this.rotated ||
                    this.myColor === 1 /* PieceColor.Red */ && this.rotated) {
                    this.rotate();
                }
                //Red ready to play
                this.updateTime(1 /* PieceColor.Red */, this.timeEarlyTurn);
            };
            PlayerModel.prototype.leave = function (username) {
                if (this.timerTurn) {
                    clearInterval(this.timerTurn);
                    this.timerTurn = null;
                }
                var model = this.models[1 /* PieceColor.Red */];
                var other = this.models[2 /* PieceColor.Black */];
                if (model.u !== username) {
                    model = this.models[2 /* PieceColor.Black */];
                    other = this.models[1 /* PieceColor.Red */];
                }
                if (model.u !== username) {
                    return;
                }
                other.turnTime('');
                other.running(false);
                model.u = '';
                model.loaded(false);
                model.username("&nbsp;");
                model.running(false);
                model.turnTime('');
                //check to show invite friend msg
                if (this.tokenLink) {
                    this.showInvite();
                }
                document.title = i18n.TitleWaitingFormat.format(Game.Helper.getName(other.u));
            };
            PlayerModel.prototype.changeState = function (username, playerState) {
                var model = this.models[1 /* PieceColor.Red */];
                if (model.u !== username) {
                    model = this.models[2 /* PieceColor.Black */];
                }
                if (model.u !== username) {
                    return;
                }
                this.updateState(model, playerState);
            };
            PlayerModel.prototype.updateTime = function (turnColor, remainTime) {
                if (remainTime === void 0) { remainTime = -1; }
                //this method update countdown timer and running state of players
                this.endAlert();
                if (remainTime > 0) {
                    this.updateCountdown(turnColor, remainTime);
                }
                var state = this.models[turnColor];
                var other = this.models[turnColor === 1 /* PieceColor.Red */ ? 2 /* PieceColor.Black */ : 1 /* PieceColor.Red */];
                other.running(false);
                state.running(true);
            };
            PlayerModel.prototype.ended = function (result) {
                if (this.timerTurn) {
                    clearInterval(this.timerTurn);
                    this.timerTurn = null;
                }
                var r = this.models[1 /* PieceColor.Red */];
                var b = this.models[2 /* PieceColor.Black */];
                r.running(false);
                r.turnTime('');
                b.running(false);
                b.turnTime('');
                this.endAlert();
                r.score(result.redScoreAfter);
                b.score(result.blackScoreAfter);
            };
            PlayerModel.prototype.getUser = function () {
                return {
                    href: ko.observable(''),
                    username: ko.observable("&nbsp;"),
                    score: ko.observable(0),
                    flag: ko.observable(''),
                    turnTime: ko.observable(''),
                    running: ko.observable(false),
                    alert: ko.observable(false),
                    state: ko.observable(''),
                    loaded: ko.observable(false),
                    u: ''
                };
            };
            PlayerModel.prototype.rotate = function () {
                this.rotated = !this.rotated;
                Game.Helper.swap(this.elements[1 /* PieceColor.Red */], this.elements[2 /* PieceColor.Black */]);
            };
            PlayerModel.prototype.setPlayer = function (player) {
                var model = this.models[player.color];
                model.u = player.username;
                var name = player.username;
                var href = "/player/" + player.username;
                if (name.indexOf("-") > 0) {
                    name = Game.Helper.getName(name);
                    href = '';
                }
                if (this.playing && player.color === this.myColor) {
                    name = "me [{0}]".format(name);
                }
                model.username(name);
                model.href(href);
                model.score(player.score);
                model.flag(player.flag ? "flag flag-" + player.flag : '');
                model.loaded(true);
                this.updateState(model, player.state);
            };
            PlayerModel.prototype.updateState = function (userModel, playerState) {
                switch (playerState) {
                    case 1 /* PlayerState.Online */:
                        userModel.state("online");
                        return;
                    case 2 /* PlayerState.Offline */:
                        userModel.state("offline");
                        return;
                }
            };
            PlayerModel.prototype.updateCountdown = function (color, millisecond) {
                // Mirrors the mobile clock fixed in commit 0efe3d4 (gameClock.ts):
                //   1. Math.ceil on every conversion — server's 29999ms displays as
                //      30, not 29. Avoids the off-by-one where the start-time
                //      duration appears to lose a second within the first 16ms.
                //   2. Absolute end-of-turn timestamp — drift-safe under setInterval
                //      jitter and tab throttling.
                //   3. 250ms tick — smoother display, matches mobile.
                //   4. Zero-padded mm:ss formatting — "00:30" not "0:30", matches mobile.
                var _this = this;
                if (this.timerTurn) {
                    clearInterval(this.timerTurn);
                    this.timerTurn = null;
                }
                var state = this.models[color];
                var other = this.models[color === 1 /* PieceColor.Red */ ? 2 /* PieceColor.Black */ : 1 /* PieceColor.Red */];
                other.turnTime('');
                if (millisecond < 0) {
                    state.turnTime("--:--");
                    return;
                }
                var endAt = Date.now() + millisecond;
                var alertFromMs = this.alertFromSeconds * 1000;
                // Returns true if the countdown is still running and should keep
                // ticking; false if we hit the terminal state (clock at zero) and
                // the caller should not schedule a setInterval. This prevents the
                // 250ms-lifetime "ghost" interval for millisecond === 0.
                var render = function () {
                    var remainMs = endAt - Date.now();
                    if (remainMs <= 0) {
                        state.turnTime("00:00");
                        _this.endAlert();
                        if (_this.timerTurn) {
                            clearInterval(_this.timerTurn);
                            _this.timerTurn = null;
                        }
                        return false;
                    }
                    // Strict < to preserve the prior boundary: alert begins when
                    // the display drops below 10s (i.e. at "00:09"), not at "00:10".
                    // The mobile clock contract doesn't cover alerting, so keep the
                    // web's historical semantics.
                    if (remainMs < alertFromMs) {
                        _this.beginAlert();
                    }
                    var totalSec = Math.ceil(remainMs / 1000);
                    var min = Math.floor(totalSec / 60);
                    var sec = totalSec % 60;
                    var pad = function (n) { return (n < 10 ? "0" + n : "" + n); };
                    state.turnTime(pad(min) + ":" + pad(sec));
                    return true;
                };
                if (render()) {
                    this.timerTurn = setInterval(render, 250);
                }
            };
            PlayerModel.prototype.showInvite = function () {
                //show token to invite other in mode friendly/challenge
            };
            PlayerModel.prototype.beginAlert = function () {
            };
            PlayerModel.prototype.endAlert = function () {
            };
            return PlayerModel;
        }());
        Models.PlayerModel = PlayerModel;
    })(Models = Game.Models || (Game.Models = {}));
})(Game || (Game = {}));
"use strict";
var Game;
(function (Game) {
    var Models;
    (function (Models) {
        var ChatModel = /** @class */ (function () {
            function ChatModel() {
                this.msg = ko.observable("");
                this.messages = ko.observableArray([]);
                this.focused = ko.observable(false);
                this.scrollDown = ko.observable(false);
                this.locked = ko.observable(false);
                this.enable = ko.observable(true);
                this.viewers = ko.observable(0);
                this.canCopyMatchUrl = ko.observable(false);
                this.copyMatchUrlBusy = ko.observable(false);
                this.copyMatchUrlText = ko.observable(i18n.CopyMatchUrl);
                this.matchUrl = "";
                this.lastSend = new Date();
                this.lastMsgs = [];
                ko.bindingHandlers.scrollDown = {
                    update: function (elem, valueAccessor) {
                        var shouldBeSelected = ko.utils.unwrapObservable(valueAccessor());
                        if (shouldBeSelected) {
                            var val = $(elem).prop("scrollHeight");
                            $(elem).scrollTop(val);
                            var boundProperty = valueAccessor();
                            if (ko.isWriteableObservable(boundProperty))
                                boundProperty(false);
                        }
                    },
                };
                ko.applyBindings(this, $('[data-role="chat"]')[0]);
            }
            ChatModel.prototype.joined = function (gameInfo, handler) {
                this.username = gameInfo.username;
                this.anon = this.username.indexOf("-") > 0;
                this.handler = handler;
                this.chatTime = gameInfo.chatTime;
                this.matchUrl = gameInfo.token ? this.buildMatchUrl(gameInfo.id, gameInfo.token) : "";
                this.canCopyMatchUrl(this.matchUrl.length > 0);
                this.copyMatchUrlText(i18n.CopyMatchUrl);
            };
            ChatModel.prototype.system = function (str) {
                this.messages.push({
                    system: true,
                    anon: false,
                    username: "",
                    message: str,
                });
            };
            ChatModel.prototype.chat = function (username, msg) {
                return this.push(username, username.indexOf("-") > 0, msg);
            };
            //#region events
            ChatModel.prototype.lockClick = function () {
                gtag("event", "lock", { event_category: "Chat" });
                this.locked(!this.locked());
                this.enable(!this.locked());
                //this.enable(this.enable() && !this.locked());
            };
            ChatModel.prototype.clearClick = function () {
                gtag("event", "game", { event_category: "chat_clear" });
                this.messages.removeAll();
                this.msg("");
            };
            ChatModel.prototype.copyMatchUrlClick = function () {
                var _this = this;
                if (!this.matchUrl || this.copyMatchUrlBusy()) {
                    return;
                }
                gtag("event", "game", { event_category: "copy_friend_link" });
                this.copyMatchUrlBusy(true);
                this.copyText(this.matchUrl).then(function () {
                    _this.copyMatchUrlText(i18n.CopiedMatchUrl);
                    Game.Helper.noti(i18n.CopiedMatchUrl);
                    if (_this.copyResetTimer) {
                        clearTimeout(_this.copyResetTimer);
                    }
                    _this.copyResetTimer = setTimeout(function () {
                        _this.copyMatchUrlText(i18n.CopyMatchUrl);
                    }, 1800);
                    _this.copyMatchUrlBusy(false);
                }, function () {
                    Game.Helper.noti(i18n.CopyMatchUrlFailed, true);
                    _this.copyMatchUrlBusy(false);
                });
            };
            ChatModel.prototype.chatPress = function (data, event) {
                try {
                    if (event.which == 13) {
                        this.chatClick();
                        return true;
                    }
                }
                catch (e) { }
                return true;
            };
            ChatModel.prototype.chatClick = function () {
                var _this = this;
                gtag("event", "game", { event_category: "chat_submit" });
                var msg = this.msg();
                if (msg == null) {
                    return;
                }
                msg = msg.trim();
                var duplicate = false;
                for (var i = 0; i < this.lastMsgs.length; i++) {
                    if (msg == this.lastMsgs[i]) {
                        duplicate = true;
                        break;
                    }
                }
                if (!duplicate) {
                    this.lastMsgs.push(msg);
                    var length = this.lastMsgs.length;
                    if (length > 2) {
                        this.lastMsgs = this.lastMsgs.slice(length - 2);
                    }
                }
                if (duplicate || !this.handler) {
                    this.push(this.username, this.anon, msg);
                    this.msg("");
                    return;
                }
                if (msg.length == 0 ||
                    new Date().getTime() - this.lastSend.getTime() < this.chatTime) {
                    return;
                }
                this.enable(false);
                this.handler(msg).then(function (success) {
                    if (success) {
                        _this.push(_this.username, _this.anon, msg);
                        _this.msg("");
                    }
                    _this.enable(true);
                    _this.focused(true);
                });
            };
            //#endregion
            ChatModel.prototype.buildMatchUrl = function (roomId, token) {
                var path = "/game/" + roomId + "?token=" + encodeURIComponent(token);
                var origin = window.location.origin || window.location.protocol + "//" + window.location.host;
                return origin + path;
            };
            ChatModel.prototype.copyText = function (text) {
                var clipboard = navigator.clipboard;
                if (clipboard && clipboard.writeText) {
                    return clipboard.writeText(text);
                }
                return new Promise(function (resolve, reject) {
                    var input = document.createElement("textarea");
                    input.value = text;
                    input.setAttribute("readonly", "readonly");
                    input.style.position = "fixed";
                    input.style.left = "-1000px";
                    input.style.top = "-1000px";
                    document.body.appendChild(input);
                    input.select();
                    input.setSelectionRange(0, input.value.length);
                    var copied = document.execCommand("copy");
                    document.body.removeChild(input);
                    if (copied) {
                        resolve();
                    }
                    else {
                        reject();
                    }
                });
            };
            ChatModel.prototype.push = function (username, anon, msg) {
                if (this.locked()) {
                    return false;
                }
                var m = { system: false, anon: anon, username: username, message: msg };
                this.messages.push(m);
                var self = this;
                setTimeout(function () {
                    self.scrollDown(true);
                }, 0);
                return true;
            };
            return ChatModel;
        }());
        Models.ChatModel = ChatModel;
    })(Models = Game.Models || (Game.Models = {}));
})(Game || (Game = {}));
"use strict";
var Game;
(function (Game) {
    var Render = /** @class */ (function () {
        function Render(moveHandler) {
            this.rotated = false;
            this.$board = $('.xq-board');
            this.$blackDeads = $('[data-role="pieces"] [data-color="black"]');
            this.$redDeads = $('[data-role="pieces"] [data-color="red"]');
            this.$board.xq("set", { moveCallback: moveHandler });
        }
        Render.prototype.joined = function (playing, gameInfo) {
            var _this = this;
            this.playing = playing;
            this.myColor = gameInfo.myColor;
            this.variant = gameInfo.variant;
            //rotating
            if (this.myColor === 2 /* PieceColor.Black */ && !this.rotated ||
                this.myColor === 1 /* PieceColor.Red */ && this.rotated) {
                this.rotate();
            }
            this.$board.xq("set", { orientColor: this.myColor });
            this.$board.xq("newBoard", playing && (gameInfo.roomState === 2 /* RoomState.Ready */ || gameInfo.roomState === 3 /* RoomState.Running */) ? this.myColor : null, gameInfo.turnColor, this.variant, gameInfo.pieces);
            if (gameInfo.lastTurns.length > 0) {
                this.$board.xq("after", gameInfo.lastTurns[gameInfo.lastTurns.length - 1]);
            }
            //clear dead-piece holders before redraw — joined() runs again on reconnect
            this.$blackDeads.empty();
            this.$redDeads.empty();
            gameInfo.deadPieces.forEach(function (p) {
                _this.drawOutPiece(p);
            });
        };
        Render.prototype.ready = function (playing, color, pieces) {
            this.playing = playing;
            this.myColor = color;
            this.$board.xq("set", { orientColor: this.myColor });
            this.$board.xq("newBoard", this.playing ? this.myColor : null, 1 /* PieceColor.Red */, this.variant, pieces);
            //clear dead pieces
            this.$blackDeads.empty();
            this.$redDeads.empty();
            //rotating
            if (this.myColor === 2 /* PieceColor.Black */ && !this.rotated ||
                this.myColor === 1 /* PieceColor.Red */ && this.rotated) {
                this.rotate();
            }
        };
        Render.prototype.beginTurn = function () {
            //allow moving
            this.$board.xq("setTurn", this.myColor);
        };
        Render.prototype.endTurn = function () {
            //disallow moving
            this.$board.xq("setTurn", this.myColor === 1 /* PieceColor.Red */ ? 2 /* PieceColor.Black */ : 1 /* PieceColor.Red */);
        };
        Render.prototype.drawTurn = function (turn) {
            this.$board.xq("draw", turn);
            if (turn.result.eat) {
                this.drawOutPiece(turn.result.eat);
            }
        };
        Render.prototype.afterTurn = function (turn) {
            this.$board.xq("after", turn);
            if (turn.result.eat) {
                this.drawOutPiece(turn.result.eat);
            }
        };
        Render.prototype.getType = function (t) {
            switch (t) {
                case 2 /* PieceType.Adviser */:
                    return "adviser";
                case 6 /* PieceType.Cannon */:
                    return "cannon";
                case 5 /* PieceType.Chariot */:
                    return "chariot";
                case 3 /* PieceType.Elephant */:
                    return "elephant";
                case 4 /* PieceType.Horse */:
                    return "horse";
                case 1 /* PieceType.King */:
                    return "king";
                case 7 /* PieceType.Pawn */:
                    return "pawn";
            }
        };
        Render.prototype.drawOutPiece = function (piece) {
            var holder = this.$blackDeads;
            var color = "black";
            if (piece.color === 1 /* PieceColor.Red */) {
                holder = this.$redDeads;
                color = "red";
            }
            var type = "";
            if (this.variant === 1 /* Variant.Classic */ || piece.opened) {
                type = this.getType(piece.type);
            }
            $('<div/>').addClass(["xq-piece", color, type].join(" ")).appendTo(holder);
        };
        Render.prototype.rotate = function () {
            this.rotated = !this.rotated;
            Game.Helper.swap(this.$blackDeads[0], this.$redDeads[0]);
        };
        return Render;
    }());
    Game.Render = Render;
})(Game || (Game = {}));
"use strict";
/// <reference path="Game.Sound.ts" />
var Game;
(function (Game) {
    var Engine = /** @class */ (function () {
        function Engine() {
            var _this = this;
            this.playingTurn = false;
            this.reconnecting = false;
            this.stopping = false;
            this.signalRKeepAliveIntervalInMilliseconds = 5000;
            this.signalRServerTimeoutInMilliseconds = 15000;
            this.reconnectDelaysInMilliseconds = [
                2000,
                2000,
                2000,
                2000,
                2000,
                2000,
                2000,
                2000,
                2000,
                2000,
                2000,
                2000,
            ];
            var params = window.location.href.split("/")[4].split(/\?|=/);
            this.id = params[0];
            this.token = params[2];
            this.actionVm = new Game.Models.ActionModel(function () { return _this.joinHandler(); }, function () { return _this.resignHandler(); }, function () { return _this.drawHandler(); }, function () { return _this.withdrawHandler(); }, function () { return _this.rematchHandler(); }, function () { return _this.quitHandler(); });
            this.playerVm = new Game.Models.PlayerModel();
            this.chatVm = new Game.Models.ChatModel();
            this.render = new Game.Render(function (move, fail) { return _this.userMoved(move, fail); });
        }
        Engine.prototype.initialize = function (resultChanged, isDebug) {
            this.onResultChanged = resultChanged;
            Game.Helper.logging = !!isDebug;
            this.initHub();
            this.connect();
        };
        //#region "handlers"
        Engine.prototype.failHandler = function () {
            return new Promise(function () { return false; }) /*resolve but return false*/;
        };
        Engine.prototype.joinHandler = function () {
            var _this = this;
            this.connection.invoke("Join").then(function (r) {
                if (r) {
                    _this.chatVm.system(i18n.JoinedThisGame);
                }
                else {
                    Game.Helper.noti(i18n.FailToJoin);
                    //consider to return enum code
                }
            });
        };
        Engine.prototype.resignHandler = function () {
            this.connection.invoke("Resign");
        };
        Engine.prototype.drawHandler = function () {
            return this.connection.invoke("Draw");
        };
        Engine.prototype.withdrawHandler = function () {
            var _this = this;
            return this.connection.invoke("Withdraw").then(function (r) {
                if (!r) {
                    _this.chatVm.system(i18n.CannotCancelDrawRequest);
                }
                return r;
            });
        };
        Engine.prototype.rematchHandler = function () {
            this.connection.invoke("Rematch");
        };
        Engine.prototype.quitHandler = function () {
            if (this.playing && this.gameInfo.roomState === 3 /* RoomState.Running */) {
                if (!confirm(i18n.ConfirmQuit)) {
                    return;
                }
            }
            if (!this.joined) {
                Game.Helper.goBack();
            }
            this.quiting = true;
            try {
                this.connection.invoke("Quit").then(function (r) {
                    Game.Helper.goBack();
                });
            }
            catch (e) {
                Game.Helper.goBack();
            }
        };
        //#endregion
        Engine.prototype.chatHandler = function (msg) {
            if (!this.joined) {
                return this.failHandler();
            }
            if (!this.playing && this.gameInfo.username.indexOf("-") > 0) {
                this.chatVm.system(i18n.LoginToChat);
                return this.failHandler();
            }
            return this.connection.invoke("Chat", msg);
        };
        //#region "hub client methods"
        Engine.prototype.onReady = function (colors, otherPlayer, pieces) {
            this.gameInfo.roomState = 2 /* RoomState.Ready */;
            if (otherPlayer) {
                this.gameInfo.players.push(otherPlayer);
                if (otherPlayer.username !== this.gameInfo.username) {
                    Game.Helper.noti(i18n.JoinedFormat.format(Game.Helper.getName(otherPlayer.username)));
                }
                Game.Helper.soundNoti();
            }
            //reassign new player colors
            this.gameInfo.players.forEach(function (player) {
                player.color = colors[player.username];
            });
            this.updateViewState();
            this.gameInfo.lastTurns = [];
            this.gameInfo.turnColor = 1 /* PieceColor.Red */;
            //new board
            this.render.ready(this.playing, this.gameInfo.myColor, pieces);
            this.playerVm.ready(this.playing, this.gameInfo.myColor, this.gameInfo.players, otherPlayer);
            this.actionVm.ready(this.playing, this.gameInfo.myColor, this.gameInfo.players);
            if (this.playing && this.gameInfo.myColor === 1 /* PieceColor.Red */) {
                this.render.beginTurn();
            }
        };
        Engine.prototype.onEvict = function () {
            this.stop();
            Game.Helper.noti(i18n.LoggedFromOther, true);
        };
        Engine.prototype.onLeave = function (username) {
            if (username === this.gameInfo.username) {
                Game.Helper.goBack();
                return;
            }
            var index = -1;
            this.gameInfo.players.forEach(function (p, k) {
                if (p.username === username) {
                    index = k;
                    return;
                }
            });
            if (index >= 0) {
                this.gameInfo.players.splice(index, 1);
                this.playerVm.leave(username);
                this.gameInfo.roomState = 1 /* RoomState.New */;
                this.actionVm.leave();
                Game.Helper.noti(i18n.LeavedFormat.format(Game.Helper.getName(username)));
            }
        };
        Engine.prototype.onMove = function (turn) {
            this.render.drawTurn(turn);
            this.addTurn(turn);
            if (this.playing) {
                this.render.beginTurn();
            }
            Game.Helper.log("onPlayTurn: {0}", JSON.stringify(turn));
        };
        Engine.prototype.onDraw = function (username, count) {
            if (count === 0) {
                this.chatVm.system(i18n.AcceptDrawFormat.format(Game.Helper.getName(username)));
                return;
            }
            var format = count === 1
                ? i18n.SendFirstDrawFormat
                : count === 2
                    ? i18n.SendSecondDrawFormat
                    : i18n.SendLastDrawFormat;
            this.chatVm.system(format.format(Game.Helper.getName(username)));
        };
        Engine.prototype.onWithdraw = function (username) {
            this.chatVm.system(i18n.CancelDrawFormat.format(Game.Helper.getName(username)));
        };
        Engine.prototype.onEnd = function (result) {
            this.gameInfo.roomState = 4 /* RoomState.Ended */;
            if (result.lastTurn != null &&
                (!this.playing || this.gameInfo.myColor !== this.gameInfo.turnColor)) {
                //only draw last turn for other player because current player is played this turn
                this.render.drawTurn(result.lastTurn);
                this.addTurn(result.lastTurn, {
                    playSoundWhenEnded: this.playing &&
                        Game.Sound.getMoveSoundState(result.lastTurn.result).check,
                });
            }
            this.playerVm.ended(result);
            this.actionVm.ended(result);
            //update score to player
            this.gameInfo.players.forEach(function (p) {
                if (p.color === 1 /* PieceColor.Red */) {
                    p.score = result.redScoreAfter;
                }
                else {
                    p.score = result.blackScoreAfter;
                }
            });
            if (this.playing) {
                var myScore = this.gameInfo.myColor === 1 /* PieceColor.Red */
                    ? result.redScore
                    : result.blackScore;
                if (this.onResultChanged) {
                    this.onResultChanged(myScore, this.gameInfo.variant);
                }
            }
            var msg;
            if (result.winnerColor) {
                msg = i18n.GameOverFormat.format(result.winnerColor === 1 /* PieceColor.Red */ ? i18n.Red : i18n.Black, result.winnerColor === 1 /* PieceColor.Red */
                    ? result.redScore
                    : result.blackScore);
            }
            else {
                msg = i18n.GameDraw;
                if (result.redScore > 0) {
                    msg += " " + i18n.GotPointFormat.format(i18n.Red, result.redScore);
                }
                else if (result.blackScore > 0) {
                    msg +=
                        " " + i18n.GotPointFormat.format(i18n.Black, result.blackScore);
                }
            }
            var matchLink = result.matchId
                ? "/match/{0}".format(result.matchId)
                : null;
            if (matchLink) {
                msg += " " + i18n.SeeMatchFormat.format(matchLink);
            }
            this.chatVm.system(msg);
        };
        Engine.prototype.onDestroy = function () {
            if (!this.quiting) {
                this.stop();
                Game.Helper.noti(i18n.GameDestroyed, true);
                this.actionVm.destroyed();
            }
        };
        Engine.prototype.onChat = function (name, message) {
            this.chatVm.chat(name, message);
        };
        Engine.prototype.onView = function (count) {
            //this.chat.updateViewer(count);
        };
        //#endregion
        Engine.prototype.onChange = function (username, state) {
            for (var i = 0; i < this.gameInfo.players.length; i++) {
                var p = this.gameInfo.players[i];
                if (p.username === username) {
                    p.state = state;
                    break;
                }
            }
            this.playerVm.changeState(username, state);
        };
        Engine.prototype.disconnected = function (reconnectFailed) {
            this.joined = false;
            this.reconnecting = !reconnectFailed;
            Game.Helper.requesting(false);
            Game.Helper.noti(reconnectFailed
                ? i18n.Disconnected
                : i18n.Reconnecting || i18n.Disconnected, true);
        };
        Engine.prototype.resyncAfterReconnect = function () {
            if (!this.reconnecting && this.joined) {
                return;
            }
            Game.Helper.requesting(true);
            this.joinGame(true);
        };
        Engine.prototype.initHub = function () {
            var _this = this;
            var connection = new signalR.HubConnectionBuilder()
                .withUrl("/gameHub")
                .withAutomaticReconnect(this.reconnectDelaysInMilliseconds)
                .build();
            connection.serverTimeoutInMilliseconds =
                this.signalRServerTimeoutInMilliseconds;
            connection.keepAliveIntervalInMilliseconds =
                this.signalRKeepAliveIntervalInMilliseconds;
            var clientMethods = {
                ready: function (colors, otherPlayer, pieces) {
                    try {
                        _this.onReady(colors, otherPlayer, pieces);
                    }
                    catch (e) {
                        Game.Helper.error(e, ["ready"]);
                    }
                },
                evict: function () {
                    _this.onEvict();
                },
                leave: function (username) {
                    try {
                        _this.onLeave(username);
                    }
                    catch (e) {
                        Game.Helper.error(e, ["leave"]);
                    }
                },
                move: function (turn) {
                    try {
                        _this.onMove(turn);
                    }
                    catch (e) {
                        Game.Helper.error(e, ["move"]);
                    }
                },
                draw: function (username, count) {
                    _this.onDraw(username, count);
                },
                withdraw: function (username) {
                    _this.onWithdraw(username);
                },
                end: function (result) {
                    try {
                        _this.onEnd(result);
                    }
                    catch (e) {
                        Game.Helper.error(e, ["end"]);
                    }
                },
                destroy: function () {
                    _this.onDestroy();
                },
                chat: function (username, message) {
                    _this.onChat(username, message);
                },
                view: function (count) {
                    try {
                        _this.onView(count);
                    }
                    catch (e) {
                        Game.Helper.error(e, ["view"]);
                    }
                },
                change: function (username, state) {
                    try {
                        _this.onChange(username, state);
                    }
                    catch (e) {
                        Game.Helper.error(e, ["change"]);
                    }
                },
            };
            connection.on("ready", clientMethods.ready);
            connection.on("evict", clientMethods.evict);
            connection.on("leave", clientMethods.leave);
            connection.on("move", clientMethods.move);
            connection.on("draw", clientMethods.draw);
            connection.on("withdraw", clientMethods.withdraw);
            connection.on("end", clientMethods.end);
            connection.on("destroy", clientMethods.destroy);
            connection.on("chat", clientMethods.chat);
            connection.on("view", clientMethods.view);
            connection.on("change", clientMethods.change);
            connection.onreconnecting(function () {
                _this.disconnected();
            });
            connection.onreconnected(function () {
                _this.resyncAfterReconnect();
            });
            connection.onclose(function () {
                if (_this.stopping) {
                    return;
                }
                _this.disconnected(true);
            });
            this.connection = connection;
        };
        //connect with server
        Engine.prototype.connect = function () {
            var self = this;
            self.connection
                .start()
                .then(function () {
                self.stopping = false;
                self.joinGame();
            })
                .catch(function () { return self.disconnected(true); });
        };
        Engine.prototype.stop = function () {
            this.joined = false;
            this.reconnecting = false;
            this.stopping = true;
            this.connection.stop();
        };
        Engine.prototype.joinGame = function (isReconnect) {
            var _this = this;
            this.connection
                .invoke("Get", parseInt(this.id), this.token, true, null /* variant */)
                .then(function (gameInfo) {
                try {
                    Game.Helper.requesting(false);
                    if (gameInfo == null) {
                        Game.Helper.goBack();
                        return;
                    }
                    if (gameInfo.lastTurns == null) {
                        gameInfo.lastTurns = [];
                    }
                    _this.gameInfo = gameInfo;
                    _this.updateViewState();
                    _this.playerVm.joined(_this.playing, gameInfo);
                    _this.actionVm.joined(_this.playing, gameInfo);
                    _this.chatVm.joined(gameInfo, function (str) { return _this.chatHandler(str); });
                    _this.render.joined(_this.playing, gameInfo);
                    if (isReconnect) {
                        Game.Helper.noti(i18n.Reconnected || i18n.JoinedThisGame);
                    }
                    else {
                        //notification
                        if (!_this.playing) {
                            Game.Helper.noti(i18n.JoinedAsViewer);
                        }
                        else {
                            if (gameInfo.roomState === 1 /* RoomState.New */) {
                                Game.Helper.noti(i18n.WaitingOther);
                                if (gameInfo.token) {
                                    _this.chatVm.system("Link \u0111\u1EC3 b\u1EA1n c\u1EE7a b\u1EA1n c\u00F3 th\u1EC3 tham gia c\u00F9ng: ".concat(window.location.href));
                                }
                            }
                            if (Game.Helper.isAnon(_this.gameInfo.username)) {
                                _this.chatVm.system(i18n.TextPlayAsAnonymous);
                            }
                            else {
                                if (gameInfo.roomState === 2 /* RoomState.Ready */ ||
                                    gameInfo.roomState === 3 /* RoomState.Running */) {
                                    if (Game.Helper.first(_this.gameInfo.players, function (p) {
                                        return p.username !== _this.gameInfo.username &&
                                            Game.Helper.isAnon(p.username);
                                    })) {
                                        _this.chatVm.system(i18n.TextPlayWithAnonymous);
                                    }
                                }
                            }
                        }
                    }
                }
                catch (e) {
                    Game.Helper.error(e, ["join"]);
                }
                _this.joined = true;
                _this.reconnecting = false;
            })
                .catch(function () {
                Game.Helper.requesting(false);
                _this.disconnected(true);
            });
        };
        Engine.prototype.updateViewState = function () {
            var _this = this;
            var following = null;
            this.gameInfo.players.forEach(function (player) {
                if (player.username === _this.gameInfo.username) {
                    following = player.username;
                    return;
                }
            });
            following = following || this.gameInfo.players[0].username;
            this.gameInfo.players.forEach(function (player) {
                if (player.username === following) {
                    _this.gameInfo.myColor = player.color;
                    return;
                }
            });
            this.playing = this.gameInfo.username === following;
        };
        Engine.prototype.userMoved = function (move, fail) {
            var _this = this;
            if (this.playingTurn) {
                return;
            }
            if (this.gameInfo.roomState !== 2 /* RoomState.Ready */ &&
                this.gameInfo.roomState !== 3 /* RoomState.Running */) {
                fail();
                return;
            }
            if (this.gameInfo.turnColor !== this.gameInfo.myColor) {
                fail();
                return;
            }
            this.playingTurn = true;
            Game.Helper.requesting(true);
            this.render.endTurn();
            this.connection
                .invoke("Move", move[0], move[1], move[2], move[3])
                .then(function (result) {
                if (result == null) {
                    //invalid move, need to rollback and notify for user to play again
                    fail();
                    _this.render.beginTurn();
                }
                else {
                    try {
                        var turn = { move: move, result: result };
                        _this.render.afterTurn(turn);
                        _this.addTurn(turn);
                    }
                    catch (e2) {
                        Game.Helper.error(e2, ["userMoved_playTurn"]);
                    }
                }
            })
                .catch(function () {
                fail();
                _this.render.beginTurn();
                //this.chat.system("Có lỗi kết nối, nước đi của bạn không gửi được tới server. Bạn hãy thử lại.");
            })
                .finally(function () {
                _this.playingTurn = false;
                Game.Helper.requesting(false);
            });
        };
        Engine.prototype.moveSound = function (check, eat) {
            Game.Helper.playGameSound(check ? "check" : eat ? "eat" : "move");
        };
        Engine.prototype.addTurn = function (turn, options) {
            var soundState = Game.Sound.getMoveSoundState(turn.result);
            this.gameInfo.lastTurns.push(turn);
            if (this.gameInfo.roomState !== 4 /* RoomState.Ended */) {
                if (this.gameInfo.lastTurns.length >= 2) {
                    this.gameInfo.roomState = 3 /* RoomState.Running */;
                    this.actionVm.start();
                }
                this.moveSound(soundState.check, soundState.eat);
                this.gameInfo.turnColor =
                    this.gameInfo.turnColor === 1 /* PieceColor.Red */
                        ? 2 /* PieceColor.Black */
                        : 1 /* PieceColor.Red */;
                this.playerVm.updateTime(this.gameInfo.turnColor, this.gameInfo.roomState === 3 /* RoomState.Running */
                    ? this.gameInfo.turnTime
                    : this.gameInfo.earlyTurnTime);
            }
            else if (options && options.playSoundWhenEnded) {
                this.moveSound(soundState.check, soundState.eat);
            }
        };
        return Engine;
    }());
    Game.Engine = Engine;
})(Game || (Game = {}));
