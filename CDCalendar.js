/* global Module */

/* Magic Mirror
 * Module: Calendar
 *
 * By Charles Duan
 * Based on calendar module by Michael Teeuw http://michaelteeuw.nl
 * MIT Licensed.
 */

Module.register("CDCalendar", {

    // Define module defaults
    defaults: {
        maximumEntries: 10, // Total Maximum Entries
        maximumNumberOfDays: 365,
        displaySymbol: true,
        defaultSymbol: "calendar", // Fontawesome Symbol see http://fontawesome.io/cheatsheet/
        displayRepeatingCountTitle: false,
        defaultRepeatingCountTitle: "",
        maxTitleLength: 25,
        wrapEvents: false, // wrap events to multiple lines breaking at maxTitleLength
        fetchInterval: 5 * 60 * 1000, // Update every 5 minutes.
        animationSpeed: 2000,
        urgency: 7,
        timeFormat: "relative",
        dateFormat: "MMM Do",
        dateEndFormat: "HH:mm",
        fullDayEventDateFormat: "MMM Do",
        showEnd: true,
        getRelative: 6,
        hidePrivate: false,
        hideOngoing: false,
        colored: false,
        coloredSymbolOnly: false,
        tableClass: "small",
        calendars: [
            {
                symbol: "calendar",
                url: "http://www.calendarlabs.com/templates/ical/US-Holidays.ics",
            },
        ],
        titleReplace: {
            "De verjaardag van ": "",
            "'s birthday": ""
        },
        broadcastEvents: true,
        excludedEvents: [],
        customEvents: [], // Array of {keyword: "", symbol: "", color: ""} where Keyword is a regexp and symbol/color are to be applied for matched
    },

    // Define required scripts.
    getStyles: function () {
        return ["calendar.css", "font-awesome.css"];
    },

    // Define required scripts.
    getScripts: function () {
        return ["moment.js"];
    },

    // Define required translations.
    getTranslations: function () {
        // The translations for the default modules are defined in the core translation files.
        // Therefor we can just return false. Otherwise we should have returned a dictionary.
        // If you're trying to build your own module including translations, check out the documentation.
        return false;
    },

    // Override start method.
    start: function () {
        Log.log("Starting module: " + this.name);

        // Set locale.
        moment.updateLocale(config.language, this.getLocaleSpecification(config.timeFormat));

        // clear data holder before start
        this.calendarData = {};

        // indicate no data available yet
        this.loaded = false;

        // for (var c in this.config.calendars) {}
        //    var calendar = this.config.calendars[c];
        this.config.calendars.forEach((calendar) => {
            calendar.url = calendar.url.replace("webcal://", "http://");

            const calendarConfig = {
                maximumEntries: calendar.maximumEntries,
                maximumNumberOfDays: calendar.maximumNumberOfDays,
                pastDaysCount: calendar.pastDaysCount,
                broadcastPastEvents: calendar.broadcastPastEvents,
                selfSignedCert: calendar.selfSignedCert,
            };

            if (calendar.symbolClass === "undefined" || calendar.symbolClass === null) {
                calendarConfig.symbolClass = "";
            }
            if (calendar.titleClass === "undefined" || calendar.titleClass === null) {
                calendarConfig.titleClass = "";
            }
            if (calendar.timeClass === "undefined" || calendar.timeClass === null) {
                calendarConfig.timeClass = "";
            }

            // we check user and password here for backwards compatibility with old configs
            if(calendar.user && calendar.pass) {
                Log.warn("Deprecation warning: Please update your calendar authentication configuration.");
                Log.warn("https://github.com/MichMich/MagicMirror/tree/v2.1.2/modules/default/calendar#calendar-authentication-options");
                calendar.auth = {
                    user: calendar.user,
                    pass: calendar.pass
                }
            }

            this.addCalendar(calendar.url, calendar.auth, calendarConfig);
        });
        // Refresh the DOM every minute if needed: When using relative date
        // format for events that start or end in less than an hour, the date
        // shows minute granularity and we want to keep that accurate.
        const ONE_MINUTE = 60 * 1000;
        setTimeout(() => {
            setInterval(() => {
                this.updateDom(1);
            }, ONE_MINUTE);
        }, ONE_MINUTE - (new Date() % ONE_MINUTE));
    },

    // Override socket notification handler.
    socketNotificationReceived: function (notification, payload) {
        if (notification === "FETCH_CALENDAR") {
            this.sendSocketNotification(notification, {
                url: payload.url, id: this.identifier
            });
        }

        if (this.identifier !== payload.id) {
            return;
        }

        if (notification === "CALENDAR_EVENTS") {
            if (this.hasCalendarURL(payload.url)) {
                this.calendarData[payload.url] = payload.events;
                this.error = null;
                this.loaded = true;

                if (this.config.broadcastEvents) {
                    this.broadcastEvents();
                }
            }
        } else if (notification === "CALENDAR_ERROR") {
            let error_message = this.translate(payload.error_type);
            this.error = this.translate("MODULE_CONFIG_ERROR", {
                MODULE_NAME: this.name, ERROR: error_message
            });
            this.loaded = true;
        } else if (notification === "FETCH_ERROR") {
            Log.error(
                "Calendar Error. Could not fetch calendar: " + payload.url
            );
        } else if (notification === "INCORRECT_URL") {
            Log.error("Calendar Error. Incorrect url: " + payload.url);
        } else {
            Log.log(
                "Calendar received an unknown socket notification: "
                + notification
            );
        }

        this.updateDom(this.config.animationSpeed);
    },

    // Override dom generator.
    getDom: function () {
        const ONE_SECOND = 1000; // 1,000 milliseconds
        const ONE_MINUTE = ONE_SECOND * 60;
        const ONE_HOUR = ONE_MINUTE * 60;
        const ONE_DAY = ONE_HOUR * 24;

        var events = this.createEventList();
        var wrapper = document.createElement("div");
        wrapper.className = this.config.tableClass;

        if (this.error) {
            wrapper.innerHTML = this.error;
            wrapper.className = `${this.config.tableClass} dimmed`;
            return wrapper;
        }

        if (events.length === 0) {
            wrapper.innerHTML = (this.loaded) ?
                this.translate("EMPTY") :
                this.translate("LOADING");
            wrapper.className = this.config.tableClass + " dimmed";
            return wrapper;
        }

        var lastSeenDate = "";

        // for (var e in events) {}
        //     var event = events[e];
        events.forEach((event, index) => {
            const dateAsString = moment(
                event.startDate, "x"
            ).format(this.config.dateFormat);

            if (this.config.timeFormat === "dateheaders") {
                if (lastSeenDate !== dateAsString) {
                    const dateRow = document.createElement("div");

                    dateRow.className = "normal dateheader"
                    if (event.today) dateRow.className += " today";
                    else if (event.dayBeforeYesterday)
                        dateRow.className += " dayBeforeYesterday";
                    else if (event.yesterday) dateRow.className += " yesterday";
                    else if (event.tomorrow) dateRow.className += " tomorrow";
                    else if (event.dayAfterTomorrow)
                        dateRow.className += " dayAfterTomorrow";

                    dateRow.innerHTML = dateAsString;
                    wrapper.appendChild(dateRow);

                    lastSeenDate = dateAsString;
                }
            }

            const eventWrapper = document.createElement("div");

            if (this.config.colored && !this.config.coloredSymbolOnly) {
                eventWrapper.style.cssText = "color:" +
                    this.colorForUrl(event.url);
            }

            eventWrapper.className = "event-wrapper normal event";
            if (event.today) eventWrapper.className += " today";
            else if (event.dayBeforeYesterday)
                eventWrapper.className += " dayBeforeYesterday";
            else if (event.yesterday) eventWrapper.className += " yesterday";
            else if (event.tomorrow) eventWrapper.className += " tomorrow";
            else if (event.dayAfterTomorrow)
                eventWrapper.className += " dayAfterTomorrow";

            if (this.config.displaySymbol) {
                var symbolWrapper = document.createElement("span");

                if (this.config.colored && this.config.coloredSymbolOnly) {
                    symbolWrapper.style.cssText = "color:" +
                        this.colorForUrl(event.url);
                }

                symbolWrapper.className = "symbol";
                var symbols = this.symbolsForUrl(event.url);
                if(typeof symbols === "string") {
                    symbols = [symbols];
                }

                for(var i = 0; i < symbols.length; i++) {
                    var symbol = document.createElement("span");
                    symbol.className = "fa fa-fw fa-" + symbols[i];
                    if(i > 0){
                        symbol.style.paddingLeft = "5px";
                    }
                    symbolWrapper.appendChild(symbol);
                }
                eventWrapper.appendChild(symbolWrapper);
            }

            var titleWrapper = document.createElement("span"),
                repeatingCountTitle = "";

            if (this.config.displayRepeatingCountTitle) {

                repeatingCountTitle = this.countTitleForUrl(event.url);

                if (repeatingCountTitle !== "") {
                    var thisYear = new Date(
                        parseInt(event.startDate)
                    ).getFullYear();
                    var yearDiff = thisYear - event.firstYear;
                    repeatingCountTitle = ", " + yearDiff + ". " +
                        repeatingCountTitle;
                }
            }

            titleWrapper.innerHTML = this.titleTransform(
                event.title, this.config.titleReplace, this.config.wrapEvents,
                this.config.maxTitleLength, this.config.maxTitleLines
            ) + repeatingCountTitle;

            const titleClass = this.titleClassForUrl(event.url);

            if(this.config.timeFormat === "dateheaders"){

                if (!event.fullDayEvent) {
                    var timeWrapper = document.createElement("span");
                    timeWrapper.className = "time light";
                    timeWrapper.align = "left";
                    var timeFormatString = "";
                    switch (config.timeFormat) {
                        case 12: {
                            timeFormatString = "h:mm A";
                            break;
                        }
                        case 24: {
                            timeFormatString = "HH:mm";
                            break;
                        }
                        default: {
                            timeFormatString = "HH:mm";
                            break;
                        }
                    }
                    timeWrapper.innerHTML = "<span>" + moment(
                        event.startDate, "x"
                    ).format(timeFormatString) + "</span>";
                    eventWrapper.appendChild(timeWrapper);
                }

            }else{
                var timeWrapper = document.createElement("span");

                //console.log(event.today);
                var now = new Date();
                // Define second, minute, hour, and day variables
                var oneSecond = 1000; // 1,000 milliseconds
                var oneMinute = oneSecond * 60;
                var oneHour = oneMinute * 60;
                var oneDay = oneHour * 24;
                if (event.fullDayEvent) {
                    if (event.today) {
                        timeWrapper.innerHTML = this.capFirst(this.translate("TODAY"));
                    } else if (event.startDate - now < oneDay && event.startDate - now > 0) {
                        timeWrapper.innerHTML = this.capFirst(this.translate("TOMORROW"));
                    } else if (event.startDate - now < 2 * oneDay && event.startDate - now > 0) {
                        if (this.translate("DAYAFTERTOMORROW") !== "DAYAFTERTOMORROW") {
                            timeWrapper.innerHTML = this.capFirst(this.translate("DAYAFTERTOMORROW"));
                        } else {
                            timeWrapper.innerHTML = this.capFirst(moment(event.startDate, "x").fromNow());
                        }
                    } else {
                        /* Check to see if the user displays absolute or
                         * relative dates with their events Also check to see if
                         * an event is happening within an 'urgency' time
                         * frameElement For example, if the user set an .urgency
                         * of 7 days, those events that fall within that time
                         * frame will be displayed with 'in xxx' time format or
                         * moment.fromNow()
                         *
                         * Note: this needs to be put in its own function, as
                         * the whole thing repeats again verbatim
                         */
                        if (this.config.timeFormat === "absolute") {
                            if ((this.config.urgency > 1) && (event.startDate - now < (this.config.urgency * oneDay))) {
                                // This event falls within the config.urgency period that the user has set
                                timeWrapper.innerHTML = this.capFirst(moment(event.startDate, "x").fromNow());
                            } else {
                                timeWrapper.innerHTML = this.capFirst(moment(event.startDate, "x").format(this.config.fullDayEventDateFormat));
                            }
                        } else {
                            timeWrapper.innerHTML = this.capFirst(moment(event.startDate, "x").fromNow());
                        }
                    }
                    if(this.config.showEnd){
                        timeWrapper.innerHTML += "-" ;
                        timeWrapper.innerHTML += this.capFirst(moment(event.endDate  , "x").format(this.config.fullDayEventDateFormat));
                    }
                } else {
                    if (event.startDate >= new Date()) {
                        if (event.startDate - now < 2 * oneDay) {
                            // This event is within the next 48 hours (2 days)
                            if (event.startDate - now < this.config.getRelative * oneHour) {
                                // If event is within 6 hour, display 'in xxx' time format or moment.fromNow()
                                timeWrapper.innerHTML = this.capFirst(moment(event.startDate, "x").fromNow());
                            } else {
                                if(this.config.timeFormat === "absolute") {
                                    timeWrapper.innerHTML = this.capFirst(moment(event.startDate, "x").format(this.config.dateFormat));
                                } else {
                                    // Otherwise just say 'Today/Tomorrow at such-n-such time'
                                    timeWrapper.innerHTML = this.capFirst(moment(event.startDate, "x").calendar());
                                }
                            }
                        } else {
                            /* Check to see if the user displays absolute or relative dates with their events
                            * Also check to see if an event is happening within an 'urgency' time frameElement
                            * For example, if the user set an .urgency of 7 days, those events that fall within that
                            * time frame will be displayed with 'in xxx' time format or moment.fromNow()
                            *
                            * Note: this needs to be put in its own function, as the whole thing repeats again verbatim
                            */
                            if (this.config.timeFormat === "absolute") {
                                if ((this.config.urgency > 1) && (event.startDate - now < (this.config.urgency * oneDay))) {
                                    // This event falls within the config.urgency period that the user has set
                                    timeWrapper.innerHTML = this.capFirst(moment(event.startDate, "x").fromNow());
                                } else {
                                    timeWrapper.innerHTML = this.capFirst(moment(event.startDate, "x").format(this.config.dateFormat));
                                }
                            } else {
                                timeWrapper.innerHTML = this.capFirst(moment(event.startDate, "x").fromNow());
                            }
                        }
                    } else {
                        timeWrapper.innerHTML = this.capFirst(
                            this.translate("RUNNING", {
                                fallback: this.translate("RUNNING") + " {timeUntilEnd}",
                                timeUntilEnd: moment(event.endDate, "x").fromNow(true)
                            })
                        );
                    }
                    if (this.config.showEnd) {
                        timeWrapper.innerHTML += "-";
                        timeWrapper.innerHTML += this.capFirst(moment(event.endDate, "x").format(this.config.dateEndFormat));

                    }
                }
                //timeWrapper.innerHTML += ' - '+ moment(event.startDate,'x').format('lll');
                //console.log(event);
                timeWrapper.innerHTML = "<span>" + timeWrapper.innerHTML +
                    "</span>";
                timeWrapper.className = "time light";
                eventWrapper.appendChild(timeWrapper);
            }
            eventWrapper.appendChild(titleWrapper);

            wrapper.appendChild(eventWrapper);

        });

        return wrapper;
    },

    /**
     * This function accepts a number (either 12 or 24) and returns a moment.js
     * LocaleSpecification with the corresponding timeformat to be used in the
     * calendar display. If no number is given (or otherwise invalid input) it
     * will a localeSpecification object with the system locale time format.
     *
     * @param {number} timeFormat Specifies either 12 or 24 hour time format
     * @returns {moment.LocaleSpecification}
     */
    getLocaleSpecification: function(timeFormat) {
        switch (timeFormat) {
            case 12: {
                return { longDateFormat: {LT: "h:mm A"} };
                break;
            }
            case 24: {
                return { longDateFormat: {LT: "HH:mm"} };
                break;
            }
            default: {
                return { longDateFormat: {
                    LT: moment.localeData().longDateFormat("LT")
                } };
                break;
            }
        }
    },

    /* hasCalendarURL(url)
     * Check if this config contains the calendar url.
     *
     * argument url string - Url to look for.
     *
     * return bool - Has calendar url
     */
    hasCalendarURL: function (url) {
        //for (var c in this.config.calendars) {}
        //    var calendar = this.config.calendars[c];
        for (const calendar of this.config.calendars) {
            if (calendar.url === url) {
                return true;
            }
        }

        return false;
    },

    /* createEventList()
     * Creates the sorted list of all events.
     *
     * return array - Array with events.
     */
    createEventList: function () {
        const ONE_SECOND = 1000; // 1,000 milliseconds
        const ONE_MINUTE = ONE_SECOND * 60;
        const ONE_HOUR = ONE_MINUTE * 60;
        const ONE_DAY = ONE_HOUR * 24;
        const today = moment().startOf("day");
        const now = new Date();
        const future = moment().startOf("day").add(
            this.config.maximumNumberOfDays, "days"
        ).toDate();

        let events = [];
        // for (var c in this.calendarData) {}
        //    var calendar = this.calendarData[c];
        for (const calendarUrl in this.calendarData) {
            const calendar = this.calendarData[calendarUrl];
            let maxPastDaysCompare = now - this.maximumPastDaysForUrl(
                calendarUrl
            ) * ONE_DAY;
            for (const e in calendar) {
                // clone object
                const event = JSON.parse(JSON.stringify(calendar[e]));
                if (this.config.hidePrivate && event.class === "PRIVATE") {
                    // do not add the current event, skip it
                    continue;
                }
                if (this.config.hideOngoing && event.startDate < now) {
                    continue;
                }
                if (this.listContainsEvent(events,event)) {
                    continue;
                }
                event.url = calendarUrl;
                event.today = (
                    event.startDate >= today
                    && event.startDate < today + ONE_DAY
                );
                event.dayBeforeYesterday = (
                    event.startDate >= today - ONE_DAY * 2 &&
                    event.startDate < today - ONE_DAY
                );
                event.yesterday = event.startDate >= today - ONE_DAY &&
                    event.startDate < today;
                event.tomorrow = !event.today &&
                    event.startDate >= today + ONE_DAY &&
                    event.startDate < today + 2 * ONE_DAY;
                event.dayAfterTomorrow = !event.tomorrow &&
                    event.startDate >= today + ONE_DAY * 2 &&
                    event.startDate < today + 3 * ONE_DAY;

                /* if sliceMultiDayEvents is set to true, multiday events
                 * (events exceeding at least one midnight) are sliced into
                 * days, otherwise, esp. in dateheaders mode it is not clear how
                 * long these events are.
                 */
                const maxCount = Math.ceil(
                    (event.endDate - 1 - moment(
                        event.startDate, "x"
                    ).endOf("day").format("x")) / ONE_DAY
                ) + 1;
                if (this.config.sliceMultiDayEvents && maxCount > 1) {
                    const splitEvents = [];
                    let midnight = moment(
                        event.startDate, "x"
                    ).clone().startOf("day").add(1, "day").format("x");
                    let count = 1;
                    while (event.endDate > midnight) {
                        // clone object
                        const thisEvent = JSON.parse(JSON.stringify(event));
                        thisEvent.today = thisEvent.startDate >= today &&
                            thisEvent.startDate < today + ONE_DAY;
                        thisEvent.tomorrow = !thisEvent.today &&
                            thisEvent.startDate >= today + ONE_DAY &&
                            thisEvent.startDate < today + 2 * ONE_DAY;
                        thisEvent.endDate = midnight;
                        thisEvent.title += ` (${count}/${maxCount})`;
                        splitEvents.push(thisEvent);

                        event.startDate = midnight;
                        count += 1;
                        midnight = moment(
                            midnight, "x"
                        ).add(1, "day").format("x"); // next day
                    }
                    // Last day
                    event.title += ` (${count}/${maxCount})`;
                    event.today += event.startDate >= today &&
                        event.startDate < today + ONE_DAY;
                    event.tomorrow = !event.today &&
                        event.startDate >= today + ONE_DAY &&
                        event.startDate < today + 2 * ONE_DAY;
                    splitEvents.push(event);

                    for (let splitEvent of splitEvents) {
                        if (splitEvent.endDate > now &&
                                splitEvent.endDate <= future) {
                            events.push(splitEvent);
                        }
                    }
                } else {
                    events.push(event);
                }
            }
        }

        events.sort(function (a, b) {
            return a.startDate - b.startDate;
        });

        return events.slice(0, this.config.maximumEntries);
    },


    listContainsEvent: function(eventList, event){
        for (var evt of eventList) {
            if (evt.title === event.title &&
                parseInt(evt.startDate) === parseInt(event.startDate)) {
                return true;
            }
        }
        return false;

    },

    /* createEventList(url)
     * Requests node helper to add calendar url.
     *
     * argument url string - Url to add.
     */
    addCalendar: function (url, auth, calendarConfig) {
        this.sendSocketNotification("ADD_CALENDAR", {
            id: this.identifier,
            url: url,
            excludedEvents: calendarConfig.excludedEvents || this.config.excludedEvents,
            maximumEntries: calendarConfig.maximumEntries || this.config.maximumEntries,
            maximumNumberOfDays: calendarConfig.maximumNumberOfDays || this.config.maximumNumberOfDays,
            pastDaysCount: calendarConfig.pastDaysCount || this.config.pastDaysCount,
            fetchInterval: this.config.fetchInterval,
            symbolClass: calendarConfig.symbolClass,
            titleClass: calendarConfig.titleClass,
            timeClass: calendarConfig.timeClass,
            auth: auth
        });
    },

    /* symbolsForUrl(url)
     * Retrieves the symbols for a specific url.
     *
     * argument url string - Url to look for.
     *
     * return string/array - The Symbols
     */
    symbolsForUrl: function (url) {
        return this.getCalendarProperty(url, "symbol", this.config.defaultSymbol);
    },

    /**
     * Retrieves the titleClass for a specific calendar url.
     *
     * @param {string} url The calendar url
     * @returns {string} The class to be used for the title of the calendar
     */
    titleClassForUrl: function (url) {
        return this.getCalendarProperty(url, "titleClass", "");
    },

    /* colorForUrl(url)
     * Retrieves the color for a specific url.
     *
     * argument url string - Url to look for.
     *
     * return string - The Color
     */
    colorForUrl: function (url) {
        return this.getCalendarProperty(url, "color", "#fff");
    },

    /* countTitleForUrl(url)
     * Retrieves the name for a specific url.
     *
     * argument url string - Url to look for.
     *
     * return string - The Symbol
     */
    countTitleForUrl: function (url) {
        return this.getCalendarProperty(url, "repeatingCountTitle", this.config.defaultRepeatingCountTitle);
    },

    /**
     * Retrieves the maximum entry count for a specific calendar url.
     *
     * @param {string} url The calendar url
     * @returns {number} The maximum entry count
     */
    maximumEntriesForUrl: function (url) {
        return this.getCalendarProperty(url, "maximumEntries", this.config.maximumEntries);
    },

    /**
     * Retrieves the maximum count of past days which events of should be displayed for a specific calendar url.
     *
     * @param {string} url The calendar url
     * @returns {number} The maximum past days count
     */
    maximumPastDaysForUrl: function (url) {
        return this.getCalendarProperty(url, "pastDaysCount", this.config.pastDaysCount);
    },

    /* getCalendarProperty(url, property, defaultValue)
     * Helper method to retrieve the property for a specific url.
     *
     * argument url string - Url to look for.
     * argument property string - Property to look for.
     * argument defaultValue string - Value if property is not found.
     *
     * return string - The Property
     */
    getCalendarProperty: function (url, property, defaultValue) {
        // for (var c in this.config.calendars) {}
            // var calendar = this.config.calendars[c];
        for (const calendar of this.config.calendars) {
            if (calendar.url === url && calendar.hasOwnProperty(property)) {
                return calendar[property];
            }
        }

        return defaultValue;
    },

    /**
     * Shortens a string if it's longer than maxLength and add a ellipsis to the
     * end
     *
     * @param {string} string Text string to shorten
     * @param {number} maxLength The max length of the string
     * @param {boolean} wrapEvents Wrap the text after the line has reached
     * maxLength
     * @returns {string} The shortened string
     */
    shorten: function (string, maxLength, wrapEvents) {
        if (typeof string !== "string") {
            return "";
        }

        if (wrapEvents === true) {
            var temp = "";
            var currentLine = "";
            var words = string.split(" ");

            for (var i = 0; i < words.length; i++) {
                var word = words[i];
                if (currentLine.length + word.length < (typeof maxLength === "number" ? maxLength : 25) - 1) { // max - 1 to account for a space
                    currentLine += (word + " ");
                } else {
                    if (currentLine.length > 0) {
                        temp += (currentLine + "<br>" + word + " ");
                    } else {
                        temp += (word + "<br>");
                    }
                    currentLine = "";
                }
            }

            return (temp + currentLine).trim();
        } else {
            if (maxLength && typeof maxLength === "number" && string.length > maxLength) {
                return string.trim().slice(0, maxLength) + "&hellip;";
            } else {
                return string.trim();
            }
        }
    },

    /* capFirst(string)
     * Capitalize the first letter of a string
     * Return capitalized string
     */

    capFirst: function (string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    },

    /* titleTransform(title)
     * Transforms the title of an event for usage.
     * Replaces parts of the text as defined in config.titleReplace.
     * Shortens title based on config.maxTitleLength and config.wrapEvents
     *
     * argument title string - The title to transform.
     *
     * return string - The transformed title.
     */
    titleTransform: function (title) {
        for (var needle in this.config.titleReplace) {
            var replacement = this.config.titleReplace[needle];

            var regParts = needle.match(/^\/(.+)\/([gim]*)$/);
            if (regParts) {
              // the parsed pattern is a regexp.
              needle = new RegExp(regParts[1], regParts[2]);
            }

            title = title.replace(needle, replacement);
        }

        title = this.shorten(title, this.config.maxTitleLength, this.config.wrapEvents);
        return title;
    },

    /**
     * Transforms the title of an event for usage.
     * Replaces parts of the text as defined in config.titleReplace.
     * Shortens title based on config.maxTitleLength and config.wrapEvents
     *
     * @param {string} title The title to transform.
     * @param {object} titleReplace Pairs of strings to be replaced in the title
     * @param {boolean} wrapEvents Wrap the text after the line has reached
     * maxLength
     * @param {number} maxTitleLength The max length of the string
     * @param {number} maxTitleLines The max number of vertical lines before
     * cutting event title
     * @returns {string} The transformed title.
     */
    titleTransform: function (title, titleReplace, wrapEvents, maxTitleLength,
        maxTitleLines) {
        for (let needle in titleReplace) {
            const replacement = titleReplace[needle];

            const regParts = needle.match(/^\/(.+)\/([gim]*)$/);
            if (regParts) {
                // the parsed pattern is a regexp.
                needle = new RegExp(regParts[1], regParts[2]);
            }

            title = title.replace(needle, replacement);
        }

        title = this.shorten(title, maxTitleLength, wrapEvents, maxTitleLines);
        return title;
    },

    /* broadcastEvents()
     * Broadcasts the events to all other modules for reuse.
     * The all events available in one array, sorted on startdate.
     */
    broadcastEvents: function () {
        //var eventList = [];
        //for (var url in this.calendarData) {}
        //    var calendar = this.calendarData[url];
        //    for (var e in calendar) {
        //        var event = cloneObject(calendar[e]);
        const eventList = this.createEventList(false);
        for (const event of eventList) {
            event.symbol = this.symbolsForEvent(event);
            event.calendarName = this.calendarNameForUrl(event.url);
            event.color = this.colorForUrl(event.url, false);
            delete event.url;
            //eventList.push(event);
        }

        this.sendNotification("CALENDAR_EVENTS", eventList);

    },

    /**
     * Retrieves the symbols for a specific event.
     *
     * @param {object} event Event to look for.
     * @returns {string[]} The symbols
     */
    symbolsForEvent: function (event) {
        let symbols = this.getCalendarPropertyAsArray(
            event.url, "symbol", this.config.defaultSymbol
        );

        if (event.recurringEvent === true &&
            this.hasCalendarProperty(event.url, "recurringSymbol")) {
            symbols = this.mergeUnique(
                this.getCalendarPropertyAsArray(
                    event.url, "recurringSymbol", this.config.defaultSymbol
                ), symbols
            );
        }

        if (event.fullDayEvent === true &&
            this.hasCalendarProperty(event.url, "fullDaySymbol")) {
            symbols = this.mergeUnique(
                this.getCalendarPropertyAsArray(
                    event.url, "fullDaySymbol", this.config.defaultSymbol
                ), symbols
            );
        }

        // If custom symbol is set, replace event symbol
        for (let ev of this.config.customEvents) {
            if (typeof ev.symbol !== "undefined" && ev.symbol !== "") {
                let needle = new RegExp(ev.keyword, "gi");
                if (needle.test(event.title)) {
                    // Get the default prefix for this class name and add to the custom symbol provided
                    const className = this.getCalendarProperty(
                        event.url, "symbolClassName",
                        this.config.defaultSymbolClassName
                    );
                    symbols[0] = className + ev.symbol;
                    break;
                }
            }
        }

        return symbols;
    },

    mergeUnique: function (arr1, arr2) {
        return arr1.concat(
            arr2.filter(function (item) {
                return arr1.indexOf(item) === -1;
            })
        );
    },

    getCalendarPropertyAsArray: function (url, property, defaultValue) {
        let p = this.getCalendarProperty(url, property, defaultValue);
        if (property === "symbol" ||
            property === "recurringSymbol" ||
            property === "fullDaySymbol") {
            const className = this.getCalendarProperty(
                url, "symbolClassName", this.config.defaultSymbolClassName
            );
            p = className + p;
        }

        if (!(p instanceof Array)) p = [p];
        return p;
    },

    hasCalendarProperty: function (url, property) {
        return !!this.getCalendarProperty(url, property, undefined);
    },

    /**
     * Retrieves the calendar name for a specific calendar url.
     *
     * @param {string} url The calendar url
     * @returns {string} The name of the calendar
     */
    calendarNameForUrl: function (url) {
            return this.getCalendarProperty(url, "name", "");
    },

});
