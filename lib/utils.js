
module.exports = {

    /**
     * Converts a date object to a valid date-time string format
     *
     * @param {Object} date Date object to be converted
     * @return {String} Returns a valid date-time formatted string
     */
    formatInternalDate: function(date) {
        var day = date.getDate(),
            month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][date.getMonth()],
            year = date.getFullYear(),
            hour = date.getHours(),
            minute = date.getMinutes(),
            second = date.getSeconds(),
            tz = date.getTimezoneOffset(),
            tzHours = Math.abs(Math.floor(tz / 60)),
            tzMins = Math.abs(tz) - tzHours * 60;

        return (day < 10 ? '0':'') + day + '-' + month + '-' + year + ' ' +
            (hour < 10 ? '0' : '') + hour + ':' + (minute < 10 ? '0' : '') +
                minute + ':' + (second < 10 ? '0' : '') + second + ' ' +
            (tz > 0 ? '-' : '+') + (tzHours < 10 ? '0' : '') + tzHours +
            (tzMins < 10 ? '0' : '') + tzMins;
    },

    /**
     * Validates a date value. Useful for validating APPEND dates
     *
     * @param {String} date Date value to be validated
     * @return {Boolean} Returns true if the date string is in IMAP date-time format
     */
    validateInternalDate: function(date) {
        if (!date || typeof date != 'string') {
            return false;
        }
        return !!date.match(/^([ \d]\d)\-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\-(\d{4}) (\d{2}):(\d{2}):(\d{2}) ([\-+])(\d{2})(\d{2})$/);
    },

    /**
     * Toggles listed flags. Flags with `value` index will be turned on,
     * other listed fields are removed from the array
     *
     * @param {Array} flags List of flags
     * @param {Array} checkFlags Flags to toggle
     * @param {Number} value Flag from checkFlags array with value index is toggled
     */
    toggleFlags: function(flags, checkFlags, value) {
        [].concat(checkFlags || []).forEach((function(flag, i) {
            if (i == value) {
                this.ensureFlag(flags, flag);
            } else {
                this.removeFlag(flags, flag);
            }
        }.bind(this)));
    },

    /**
     * Ensures that a list of flags includes selected flag
     *
     * @param {Array} flags An array of flags to check
     * @param {String} flag If the flag is missing, add it
     */
    ensureFlag: function(flags, flag) {
        if (flags.indexOf(flag) < 0) {
            flags.push(flag);
        }
    },

    /**
     * Removes a flag from a list of flags
     *
     * @param {Array} flags An array of flags to check
     * @param {String} flag If the flag is in the list, remove it
     */
    removeFlag: function(flags, flag) {
        var i;
        if (flags.indexOf(flag) >= 0) {
            for (i = flags.length - 1; i >= 0; i--) {
                if (flags[i] == flag) {
                    flags.splice(i, 1);
                }
            }
        }
    }

};
