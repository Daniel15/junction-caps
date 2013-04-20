/**
 * Remove duplicate features from the specified array. Modifies the array in-place.
 * @param data Array to remove duplicates from
 */
exports.removeDuplicates = function(data) {
	var seen = {};

	for (var i = data.length - 1; i >= 0; i--) {
		if (seen[data[i]]) {
			data.splice(i, 1);
			continue;
		}

		seen[data[i]] = true;
	}
}

/**
 * Deep clone the specified object
 * @param data Object to clone
 * @returns {*} Clone of the object
 */
exports.deepClone = function(data) {
	return JSON.parse(JSON.stringify(data));	
}