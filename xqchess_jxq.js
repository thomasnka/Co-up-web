/*
 * transform: A jQuery cssHooks adding cross-browser 2d transform capabilities to $.fn.css() and $.fn.animate()
 *
 * limitations:
 * - requires jQuery 1.4.3+
 * - Should you use the *translate* property, then your elements need to be absolutely positionned in a relatively positionned wrapper **or it will fail in IE678**.
 * - transformOrigin is not accessible
 *
 * latest version and complete README available on Github:
 * https://github.com/louisremi/jquery.transform.js
 *
 * Copyright 2011 @louis_remi
 * Licensed under the MIT license.
 *
 * This saved you an hour of work?
 * Send me music http://www.amazon.co.uk/wishlist/HNTU0468LQON
 *
 */
(function( $, window, document, Math, undefined ) {

/*
 * Feature tests and global variables
 */
var div = document.createElement("div"),
	divStyle = div.style,
	suffix = "Transform",
	testProperties = [
		"O" + suffix,
		"ms" + suffix,
		"Webkit" + suffix,
		"Moz" + suffix
	],
	i = testProperties.length,
	supportProperty,
	supportMatrixFilter,
	supportFloat32Array = "Float32Array" in window,
	propertyHook,
	propertyGet,
	rMatrix = /Matrix([^)]*)/,
	rAffine = /^\s*matrix\(\s*1\s*,\s*0\s*,\s*0\s*,\s*1\s*(?:,\s*0(?:px)?\s*){2}\)\s*$/,
	_transform = "transform",
	_transformOrigin = "transformOrigin",
	_translate = "translate",
	_rotate = "rotate",
	_scale = "scale",
	_skew = "skew",
	_matrix = "matrix";

// test different vendor prefixes of these properties
while ( i-- ) {
	if ( testProperties[i] in divStyle ) {
		$.support[_transform] = supportProperty = testProperties[i];
		$.support[_transformOrigin] = supportProperty + "Origin";
		continue;
	}
}
// IE678 alternative
if ( !supportProperty ) {
	$.support.matrixFilter = supportMatrixFilter = divStyle.filter === "";
}

// px isn't the default unit of these properties
$.cssNumber[_transform] = $.cssNumber[_transformOrigin] = true;

/*
 * fn.css() hooks
 */
if ( supportProperty && supportProperty != _transform ) {
	// Modern browsers can use jQuery.cssProps as a basic hook
	$.cssProps[_transform] = supportProperty;
	$.cssProps[_transformOrigin] = supportProperty + "Origin";

	// Firefox needs a complete hook because it stuffs matrix with "px"
	if ( supportProperty == "Moz" + suffix ) {
		propertyHook = {
			get: function( elem, computed ) {
				return (computed ?
					// remove "px" from the computed matrix
					$.css( elem, supportProperty ).split("px").join(""):
					elem.style[supportProperty]
				);
			},
			set: function( elem, value ) {
				// add "px" to matrices
				elem.style[supportProperty] = /matrix\([^)p]*\)/.test(value) ?
					value.replace(/matrix((?:[^,]*,){4})([^,]*),([^)]*)/, _matrix+"$1$2px,$3px"):
					value;
			}
		};
	/* Fix two jQuery bugs still present in 1.5.1
	 * - rupper is incompatible with IE9, see http://jqbug.com/8346
	 * - jQuery.css is not really jQuery.cssProps aware, see http://jqbug.com/8402
	 */
	} else if ( /^1\.[0-5](?:\.|$)/.test($.fn.jquery) ) {
		propertyHook = {
			get: function( elem, computed ) {
				return (computed ?
					$.css( elem, supportProperty.replace(/^ms/, "Ms") ):
					elem.style[supportProperty]
				);
			}
		};
	}
	/* TODO: leverage hardware acceleration of 3d transform in Webkit only
	else if ( supportProperty == "Webkit" + suffix && support3dTransform ) {
		propertyHook = {
			set: function( elem, value ) {
				elem.style[supportProperty] = 
					value.replace();
			}
		}
	}*/

} else if ( supportMatrixFilter ) {
	propertyHook = {
		get: function( elem, computed, asArray ) {
			var elemStyle = ( computed && elem.currentStyle ? elem.currentStyle : elem.style ),
				matrix, data;

			if ( elemStyle && rMatrix.test( elemStyle.filter ) ) {
				matrix = RegExp.$1.split(",");
				matrix = [
					matrix[0].split("=")[1],
					matrix[2].split("=")[1],
					matrix[1].split("=")[1],
					matrix[3].split("=")[1]
				];
			} else {
				matrix = [1,0,0,1];
			}

			if ( ! $.cssHooks[_transformOrigin] ) {
				matrix[4] = elemStyle ? parseInt(elemStyle.left, 10) || 0 : 0;
				matrix[5] = elemStyle ? parseInt(elemStyle.top, 10) || 0 : 0;

			} else {
				data = $._data( elem, "transformTranslate", undefined );
				matrix[4] = data ? data[0] : 0;
				matrix[5] = data ? data[1] : 0;
			}

			return asArray ? matrix : _matrix+"(" + matrix + ")";
		},
		set: function( elem, value, animate ) {
			var elemStyle = elem.style,
				currentStyle,
				Matrix,
				filter,
				centerOrigin;

			if ( !animate ) {
				elemStyle.zoom = 1;
			}

			value = matrix(value);

			// rotate, scale and skew
			Matrix = [
				"Matrix("+
					"M11="+value[0],
					"M12="+value[2],
					"M21="+value[1],
					"M22="+value[3],
					"SizingMethod='auto expand'"
			].join();
			filter = ( currentStyle = elem.currentStyle ) && currentStyle.filter || elemStyle.filter || "";

			elemStyle.filter = rMatrix.test(filter) ?
				filter.replace(rMatrix, Matrix) :
				filter + " progid:DXImageTransform.Microsoft." + Matrix + ")";

			if ( ! $.cssHooks[_transformOrigin] ) {

				// center the transform origin, from pbakaus's Transformie http://github.com/pbakaus/transformie
				if ( (centerOrigin = $.transform.centerOrigin) ) {
					elemStyle[centerOrigin == "margin" ? "marginLeft" : "left"] = -(elem.offsetWidth/2) + (elem.clientWidth/2) + "px";
					elemStyle[centerOrigin == "margin" ? "marginTop" : "top"] = -(elem.offsetHeight/2) + (elem.clientHeight/2) + "px";
				}

				// translate
				// We assume that the elements are absolute positionned inside a relative positionned wrapper
				elemStyle.left = value[4] + "px";
				elemStyle.top = value[5] + "px";

			} else {
				$.cssHooks[_transformOrigin].set( elem, value );
			}
		}
	};
}
// populate jQuery.cssHooks with the appropriate hook if necessary
if ( propertyHook ) {
	$.cssHooks[_transform] = propertyHook;
}
// we need a unique setter for the animation logic
propertyGet = propertyHook && propertyHook.get || $.css;

/*
 * fn.animate() hooks
 */
$.fx.step.transform = function( fx ) {
	var elem = fx.elem,
		start = fx.start,
		end = fx.end,
		pos = fx.pos,
		transform = "",
		precision = 1E5,
		i, startVal, endVal, unit;

	// fx.end and fx.start need to be converted to interpolation lists
	if ( !start || typeof start === "string" ) {

		// the following block can be commented out with jQuery 1.5.1+, see #7912
		if ( !start ) {
			start = propertyGet( elem, supportProperty );
		}

		// force layout only once per animation
		if ( supportMatrixFilter ) {
			elem.style.zoom = 1;
		}

		// replace "+=" in relative animations (-= is meaningless with transforms)
		end = end.split("+=").join(start);

		// parse both transform to generate interpolation list of same length
		$.extend( fx, interpolationList( start, end ) );
		start = fx.start;
		end = fx.end;
	}

	i = start.length;

	// interpolate functions of the list one by one
	while ( i-- ) {
		startVal = start[i];
		endVal = end[i];
		unit = +false;

		switch ( startVal[0] ) {

			case _translate:
				unit = "px";
			case _scale:
				unit || ( unit = "");

				transform = startVal[0] + "(" +
					Math.round( (startVal[1][0] + (endVal[1][0] - startVal[1][0]) * pos) * precision ) / precision + unit +","+
					Math.round( (startVal[1][1] + (endVal[1][1] - startVal[1][1]) * pos) * precision ) / precision + unit + ")"+
					transform;
				break;

			case _skew + "X":
			case _skew + "Y":
			case _rotate:
				transform = startVal[0] + "(" +
					Math.round( (startVal[1] + (endVal[1] - startVal[1]) * pos) * precision ) / precision +"rad)"+
					transform;
				break;
		}
	}

	fx.origin && ( transform = fx.origin + transform );

	propertyHook && propertyHook.set ?
		propertyHook.set( elem, transform, +true ):
		elem.style[supportProperty] = transform;
};

/*
 * Utility functions
 */

// turns a transform string into its "matrix(A,B,C,D,X,Y)" form (as an array, though)
function matrix( transform ) {
	transform = transform.split(")");
	var
			trim = $.trim
		, i = -1
		// last element of the array is an empty string, get rid of it
		, l = transform.length -1
		, split, prop, val
		, prev = supportFloat32Array ? new Float32Array(6) : []
		, curr = supportFloat32Array ? new Float32Array(6) : []
		, rslt = supportFloat32Array ? new Float32Array(6) : [1,0,0,1,0,0]
		;

	prev[0] = prev[3] = rslt[0] = rslt[3] = 1;
	prev[1] = prev[2] = prev[4] = prev[5] = 0;

	// Loop through the transform properties, parse and multiply them
	while ( ++i < l ) {
		split = transform[i].split("(");
		prop = trim(split[0]);
		val = split[1];
		curr[0] = curr[3] = 1;
		curr[1] = curr[2] = curr[4] = curr[5] = 0;

		switch (prop) {
			case _translate+"X":
				curr[4] = parseInt(val, 10);
				break;

			case _translate+"Y":
				curr[5] = parseInt(val, 10);
				break;

			case _translate:
				val = val.split(",");
				curr[4] = parseInt(val[0], 10);
				curr[5] = parseInt(val[1] || 0, 10);
				break;

			case _rotate:
				val = toRadian(val);
				curr[0] = Math.cos(val);
				curr[1] = Math.sin(val);
				curr[2] = -Math.sin(val);
				curr[3] = Math.cos(val);
				break;

			case _scale+"X":
				curr[0] = +val;
				break;

			case _scale+"Y":
				curr[3] = val;
				break;

			case _scale:
				val = val.split(",");
				curr[0] = val[0];
				curr[3] = val.length>1 ? val[1] : val[0];
				break;

			case _skew+"X":
				curr[2] = Math.tan(toRadian(val));
				break;

			case _skew+"Y":
				curr[1] = Math.tan(toRadian(val));
				break;

			case _matrix:
				val = val.split(",");
				curr[0] = val[0];
				curr[1] = val[1];
				curr[2] = val[2];
				curr[3] = val[3];
				curr[4] = parseInt(val[4], 10);
				curr[5] = parseInt(val[5], 10);
				break;
		}

		// Matrix product (array in column-major order)
		rslt[0] = prev[0] * curr[0] + prev[2] * curr[1];
		rslt[1] = prev[1] * curr[0] + prev[3] * curr[1];
		rslt[2] = prev[0] * curr[2] + prev[2] * curr[3];
		rslt[3] = prev[1] * curr[2] + prev[3] * curr[3];
		rslt[4] = prev[0] * curr[4] + prev[2] * curr[5] + prev[4];
		rslt[5] = prev[1] * curr[4] + prev[3] * curr[5] + prev[5];

		prev = [rslt[0],rslt[1],rslt[2],rslt[3],rslt[4],rslt[5]];
	}
	return rslt;
}

// turns a matrix into its rotate, scale and skew components
// algorithm from http://hg.mozilla.org/mozilla-central/file/7cb3e9795d04/layout/style/nsStyleAnimation.cpp
function unmatrix(matrix) {
	var
			scaleX
		, scaleY
		, skew
		, A = matrix[0]
		, B = matrix[1]
		, C = matrix[2]
		, D = matrix[3]
		;

	// Make sure matrix is not singular
	if ( A * D - B * C ) {
		// step (3)
		scaleX = Math.sqrt( A * A + B * B );
		A /= scaleX;
		B /= scaleX;
		// step (4)
		skew = A * C + B * D;
		C -= A * skew;
		D -= B * skew;
		// step (5)
		scaleY = Math.sqrt( C * C + D * D );
		C /= scaleY;
		D /= scaleY;
		skew /= scaleY;
		// step (6)
		if ( A * D < B * C ) {
			A = -A;
			B = -B;
			skew = -skew;
			scaleX = -scaleX;
		}

	// matrix is singular and cannot be interpolated
	} else {
		// In this case the elem shouldn't be rendered, hence scale == 0
		scaleX = scaleY = skew = 0;
	}

	// The recomposition order is very important
	// see http://hg.mozilla.org/mozilla-central/file/7cb3e9795d04/layout/style/nsStyleAnimation.cpp#l971
	return [
		[_translate, [+matrix[4], +matrix[5]]],
		[_rotate, Math.atan2(B, A)],
		[_skew + "X", Math.atan(skew)],
		[_scale, [scaleX, scaleY]]
	];
}

// build the list of transform functions to interpolate
// use the algorithm described at http://dev.w3.org/csswg/css3-2d-transforms/#animation
function interpolationList( start, end ) {
	var list = {
			start: [],
			end: []
		},
		i = -1, l,
		currStart, currEnd, currType;

	// get rid of affine transform matrix
	( start == "none" || isAffine( start ) ) && ( start = "" );
	( end == "none" || isAffine( end ) ) && ( end = "" );

	// if end starts with the current computed style, this is a relative animation
	// store computed style as the origin, remove it from start and end
	if ( start && end && !end.indexOf("matrix") && toArray( start ).join() == toArray( end.split(")")[0] ).join() ) {
		list.origin = start;
		start = "";
		end = end.slice( end.indexOf(")") +1 );
	}

	if ( !start && !end ) { return; }

	// start or end are affine, or list of transform functions are identical
	// => functions will be interpolated individually
	if ( !start || !end || functionList(start) == functionList(end) ) {

		start && ( start = start.split(")") ) && ( l = start.length );
		end && ( end = end.split(")") ) && ( l = end.length );

		while ( ++i < l-1 ) {
			start[i] && ( currStart = start[i].split("(") );
			end[i] && ( currEnd = end[i].split("(") );
			currType = $.trim( ( currStart || currEnd )[0] );

			append( list.start, parseFunction( currType, currStart ? currStart[1] : 0 ) );
			append( list.end, parseFunction( currType, currEnd ? currEnd[1] : 0 ) );
		}

	// otherwise, functions will be composed to a single matrix
	} else {
		list.start = unmatrix(matrix(start));
		list.end = unmatrix(matrix(end))
	}

	return list;
}

function parseFunction( type, value ) {
	var
		// default value is 1 for scale, 0 otherwise
		defaultValue = +(!type.indexOf(_scale)),
		scaleX,
		// remove X/Y from scaleX/Y & translateX/Y, not from skew
		cat = type.replace( /e[XY]/, "e" );

	switch ( type ) {
		case _translate+"Y":
		case _scale+"Y":

			value = [
				defaultValue,
				value ?
					parseFloat( value ):
					defaultValue
			];
			break;

		case _translate+"X":
		case _translate:
		case _scale+"X":
			scaleX = 1;
		case _scale:

			value = value ?
				( value = value.split(",") ) &&	[
					parseFloat( value[0] ),
					parseFloat( value.length>1 ? value[1] : type == _scale ? scaleX || value[0] : defaultValue+"" )
				]:
				[defaultValue, defaultValue];
			break;

		case _skew+"X":
		case _skew+"Y":
		case _rotate:
			value = value ? toRadian( value ) : 0;
			break;

		case _matrix:
			return unmatrix( value ? toArray(value) : [1,0,0,1,0,0] );
			break;
	}

	return [[ cat, value ]];
}

function isAffine( matrix ) {
	return rAffine.test(matrix);
}

function functionList( transform ) {
	return transform.replace(/(?:\([^)]*\))|\s/g, "");
}

function append( arr1, arr2, value ) {
	while ( value = arr2.shift() ) {
		arr1.push( value );
	}
}

// converts an angle string in any unit to a radian Float
function toRadian(value) {
	return ~value.indexOf("deg") ?
		parseInt(value,10) * (Math.PI * 2 / 360):
		~value.indexOf("grad") ?
			parseInt(value,10) * (Math.PI/200):
			parseFloat(value);
}

// Converts "matrix(A,B,C,D,X,Y)" to [A,B,C,D,X,Y]
function toArray(matrix) {
	// remove the unit of X and Y for Firefox
	matrix = /([^,]*),([^,]*),([^,]*),([^,]*),([^,p]*)(?:px)?,([^)p]*)(?:px)?/.exec(matrix);
	return [matrix[1], matrix[2], matrix[3], matrix[4], matrix[5], matrix[6]];
}

$.transform = {
	centerOrigin: "margin"
};

})( jQuery, window, document, Math );
"use strict";
//#endregion
var Game;
(function (Game) {
    var rows = 10, columns = 9;
    var moveColumn = {};
    moveColumn[4 /* PieceType.Horse */] = [1, 1, 2, 2, -1, -1, -2, -2];
    moveColumn[1 /* PieceType.King */] = [0, 0, 1, -1];
    moveColumn[2 /* PieceType.Adviser */] = [1, 1, -1, -1];
    moveColumn[3 /* PieceType.Elephant */] = [2, 2, -2, -2];
    moveColumn[7 /* PieceType.Pawn */] = [0, 1, -1];
    var moveRow = {};
    moveRow[4 /* PieceType.Horse */] = [2, -2, 1, -1, 2, -2, 1, -1];
    moveRow[1 /* PieceType.King */] = [1, -1, 0, 0];
    moveRow[2 /* PieceType.Adviser */] = [1, -1, 1, -1];
    moveRow[3 /* PieceType.Elephant */] = [2, -2, 2, -2];
    moveRow[7 /* PieceType.Pawn */] = [1, 0, 0];
    var defaults = {
        variant: 1 /* Variant.Classic */ /* classic or blind*/,
        movableColor: undefined /* <empty> or red or black -- user can move pieces in this color. If empty, user can view only*/,
        orientColor: 1 /* PieceColor.Red */ /*view pieces of this color in bottom*/,
        duration: 200 /*animation duration when moving*/,
        ai: false /*mode that Black will auto play*/,
        aiDefault: true /*set to false to manual invoke ai*/,
        aiColor: 2 /* PieceColor.Black */,
        endCallback: undefined /*callback to notify endgame*/,
        moveCallback: function (move, fail) {
        } /*call back when user move a piece*/
    };
    function otherColor(color) {
        return color == 1 /* PieceColor.Red */ ? 2 /* PieceColor.Black */ : 1 /* PieceColor.Red */;
    }
    function colorStr(color) {
        return color === 1 /* PieceColor.Red */ ? "red" : color === 2 /* PieceColor.Black */ ? "black" : "";
    }
    function typeStr(type) {
        if (type) {
            switch (type) {
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
        }
        return "";
    }
    function pieceClass(piece, variant) {
        return ["xq-piece", colorStr(piece.color), piece.type == 1 /* PieceType.King */ || piece.opened || variant == 1 /* Variant.Classic */ ? typeStr(piece.type) : null].join(" ");
    }
    function shuffle(array) {
        for (var i = array.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var temp = array[i];
            array[i] = array[j];
            array[j] = temp;
        }
        return array;
    }
    var Logic = /** @class */ (function () {
        function Logic(variant) {
            this.rotated = false;
            this.variant = variant;
        }
        //#region private methods
        Logic.prototype.get = function (type, color, opened) {
            return { type: type, color: color, opened: opened };
        };
        Logic.prototype.getDefault = function () {
            var board = [], i, j;
            for (i = 0; i < rows; i++) {
                board[i] = [];
                for (j = 0; j < columns; j++) {
                    board[i][j] = null;
                }
            }
            board[0][0] = this.get(5 /* PieceType.Chariot */, 2 /* PieceColor.Black */, false);
            board[0][1] = this.get(4 /* PieceType.Horse */, 2 /* PieceColor.Black */, false);
            board[0][2] = this.get(3 /* PieceType.Elephant */, 2 /* PieceColor.Black */, false);
            board[0][3] = this.get(2 /* PieceType.Adviser */, 2 /* PieceColor.Black */, false);
            board[0][4] = this.get(1 /* PieceType.King */, 2 /* PieceColor.Black */, true);
            board[0][5] = this.get(2 /* PieceType.Adviser */, 2 /* PieceColor.Black */, false);
            board[0][6] = this.get(3 /* PieceType.Elephant */, 2 /* PieceColor.Black */, false);
            board[0][7] = this.get(4 /* PieceType.Horse */, 2 /* PieceColor.Black */, false);
            board[0][8] = this.get(5 /* PieceType.Chariot */, 2 /* PieceColor.Black */, false);
            board[2][1] = this.get(6 /* PieceType.Cannon */, 2 /* PieceColor.Black */, false);
            board[2][7] = this.get(6 /* PieceType.Cannon */, 2 /* PieceColor.Black */, false);
            board[3][0] = this.get(7 /* PieceType.Pawn */, 2 /* PieceColor.Black */, false);
            board[3][2] = this.get(7 /* PieceType.Pawn */, 2 /* PieceColor.Black */, false);
            board[3][4] = this.get(7 /* PieceType.Pawn */, 2 /* PieceColor.Black */, false);
            board[3][6] = this.get(7 /* PieceType.Pawn */, 2 /* PieceColor.Black */, false);
            board[3][8] = this.get(7 /* PieceType.Pawn */, 2 /* PieceColor.Black */, false);
            board[6][0] = this.get(7 /* PieceType.Pawn */, 1 /* PieceColor.Red */, false);
            board[6][2] = this.get(7 /* PieceType.Pawn */, 1 /* PieceColor.Red */, false);
            board[6][4] = this.get(7 /* PieceType.Pawn */, 1 /* PieceColor.Red */, false);
            board[6][6] = this.get(7 /* PieceType.Pawn */, 1 /* PieceColor.Red */, false);
            board[6][8] = this.get(7 /* PieceType.Pawn */, 1 /* PieceColor.Red */, false);
            board[7][1] = this.get(6 /* PieceType.Cannon */, 1 /* PieceColor.Red */, false);
            board[7][7] = this.get(6 /* PieceType.Cannon */, 1 /* PieceColor.Red */, false);
            board[9][0] = this.get(5 /* PieceType.Chariot */, 1 /* PieceColor.Red */, false);
            board[9][1] = this.get(4 /* PieceType.Horse */, 1 /* PieceColor.Red */, false);
            board[9][2] = this.get(3 /* PieceType.Elephant */, 1 /* PieceColor.Red */, false);
            board[9][3] = this.get(2 /* PieceType.Adviser */, 1 /* PieceColor.Red */, false);
            board[9][4] = this.get(1 /* PieceType.King */, 1 /* PieceColor.Red */, true);
            board[9][5] = this.get(2 /* PieceType.Adviser */, 1 /* PieceColor.Red */, false);
            board[9][6] = this.get(3 /* PieceType.Elephant */, 1 /* PieceColor.Red */, false);
            board[9][7] = this.get(4 /* PieceType.Horse */, 1 /* PieceColor.Red */, false);
            board[9][8] = this.get(5 /* PieceType.Chariot */, 1 /* PieceColor.Red */, false);
            return board;
        };
        Logic.prototype.randomize = function () {
            //switch random position for pieces
            var reds = [], blacks = [];
            var redIndex = 0, blackIndex = 0;
            var i, j, p;
            for (i = 0; i < rows; i++) {
                for (j = 0; j < columns; j++) {
                    p = this.data[i][j];
                    if (p != null && p.type != 1 /* PieceType.King */) {
                        if (p.color == 1 /* PieceColor.Red */) {
                            reds.push(p.type);
                        }
                        else {
                            blacks.push(p.type);
                        }
                    }
                }
            }
            reds = shuffle(reds);
            blacks = shuffle(blacks);
            for (i = 0; i < rows; i++) {
                for (j = 0; j < columns; j++) {
                    p = this.data[i][j];
                    if (p != null && p.type != 1 /* PieceType.King */) {
                        p.iType = p.color == 1 /* PieceColor.Red */ ? reds[redIndex++] : blacks[blackIndex++];
                    }
                }
            }
        };
        Logic.prototype.getKingPos = function (color) {
            var i, j;
            for (i = 0; i < rows; i++) {
                for (j = 0; j < columns; j++) {
                    if (this.data[i][j] && this.data[i][j].type === 1 /* PieceType.King */ && this.data[i][j].color === color) {
                        return { row: i, column: j };
                    }
                }
            }
            return null;
        };
        //#endregion
        Logic.prototype.isValidMove = function (i1, j1, i2, j2) {
            var piece = this.data[i1][j1];
            var kingInLowRow = piece.color == 2 /* PieceColor.Black */ && !this.rotated || piece.color == 1 /* PieceColor.Red */ && this.rotated;
            var columnIndex;
            var rowIndex;
            var k;
            switch (piece.type) {
                case 5 /* PieceType.Chariot */:
                    if (i1 == i2) {
                        for (k = Math.min(j1, j2) + 1; k < Math.max(j1, j2); k++)
                            if (this.data[i1][k] != null)
                                return false;
                        return true;
                    }
                    if (j1 == j2) {
                        for (k = Math.min(i1, i2) + 1; k < Math.max(i1, i2); k++)
                            if (this.data[k][j1] != null)
                                return false;
                        return true;
                    }
                    return false;
                case 6 /* PieceType.Cannon */:
                    var tmp = 0;
                    var moveOnly = this.data[i2][j2] == null;
                    if (i1 == i2) {
                        for (k = Math.min(j1, j2) + 1; k < Math.max(j1, j2); k++)
                            if (this.data[i1][k] != null) {
                                //move to empty cell, check like chariot
                                if (moveOnly)
                                    return false;
                                tmp++;
                                //eating, must have only one piece between j1, j2
                                if (tmp >= 2)
                                    return false;
                            }
                        return (!moveOnly && tmp == 1) || moveOnly;
                    }
                    if (j1 == j2) {
                        for (k = Math.min(i1, i2) + 1; k < Math.max(i1, i2); k++)
                            if (this.data[k][j1] != null) {
                                if (moveOnly)
                                    return false;
                                tmp++;
                                if (tmp >= 2)
                                    return false;
                            }
                        return (!moveOnly && tmp == 1) || moveOnly;
                    }
                    return false;
                case 4 /* PieceType.Horse */:
                    var k1 = Math.abs(i1 - i2);
                    var k2 = Math.abs(j1 - j2);
                    //blocking check
                    if (k1 == 1 && k2 == 2) {
                        columnIndex = (j1 - j2) / 2;
                        return this.data[i1][j1 - columnIndex] == null;
                    }
                    if (k1 == 2 && k2 == 1) {
                        rowIndex = (i1 - i2) / 2;
                        return this.data[i1 - rowIndex][j1] == null;
                    }
                    return false;
                case 1 /* PieceType.King */:
                    if ((i2 > 2 && i2 < 7 || (j2 < 3 || j2 > 5))) {
                        return false;
                    }
                    return Math.abs(i1 - i2) + Math.abs(j1 - j2) == 1;
                case 2 /* PieceType.Adviser */:
                    if ((this.variant == 1 /* Variant.Classic */ || !piece.opened) && ((i2 > 2 && i2 < 7) || (j2 < 3 || j2 > 5))) {
                        return false;
                    }
                    return Math.abs(i1 - i2) == 1 && Math.abs(j1 - j2) == 1;
                case 3 /* PieceType.Elephant */:
                    if ((this.variant == 1 /* Variant.Classic */ || !piece.opened) && (kingInLowRow && i2 > 4 || (!kingInLowRow && i2 < 5))) {
                        return false;
                    }
                    var t1 = Math.abs(i1 - i2);
                    var t2 = Math.abs(j1 - j2);
                    if (t1 == 2 && t2 == 2) {
                        //blocking check
                        rowIndex = (i1 - i2) / 2;
                        columnIndex = (j1 - j2) / 2;
                        return this.data[i1 - rowIndex][j1 - columnIndex] == null;
                    }
                    return false;
                case 7 /* PieceType.Pawn */:
                    var currentRow = kingInLowRow ? i1 : 9 - i1;
                    var newRow = kingInLowRow ? i2 : 9 - i2;
                    if (newRow <= 4) {
                        //not pass the river, should increase 1 cell in the same column 
                        return j1 == j2 && newRow - currentRow == 1;
                    }
                    //pass the river
                    return newRow == currentRow
                        ? Math.abs(j1 - j2) == 1
                        : j1 == j2 && newRow - currentRow == 1;
                default:
                    return false;
            }
        };
        Logic.prototype.piecesCanMoveTo = function (color, row, column) {
            var i, j;
            for (i = 0; i < rows; i++) {
                for (j = 0; j < columns; j++) {
                    if (this.data[i][j] != null && this.data[i][j].color === color)
                        if (this.isValidMove(i, j, row, column))
                            return true;
                }
            }
            return false;
        };
        Logic.prototype.getMovables = function (row, column) {
            var result = [];
            var piece = this.data[row][column];
            var i, j, yTrans;
            switch (piece.type) {
                case 5 /* PieceType.Chariot */:
                    for (i = row + 1; i < rows; i++) {
                        if (this.data[i][column] == null)
                            result.push({ row: i, column: column });
                        else {
                            if (this.data[i][column].color != piece.color)
                                result.push({ row: i, column: column });
                            break;
                        }
                    }
                    for (i = row - 1; i >= 0; i--) {
                        if (this.data[i][column] == null)
                            result.push({ row: i, column: column });
                        else {
                            if (this.data[i][column].color != piece.color)
                                result.push({ row: i, column: column });
                            break;
                        }
                    }
                    for (j = column + 1; j < columns; j++) {
                        if (this.data[row][j] == null) {
                            result.push({ row: row, column: j });
                        }
                        else {
                            if (this.data[row][j].color != piece.color)
                                result.push({ row: row, column: j });
                            break;
                        }
                    }
                    for (j = column - 1; j >= 0; j--) {
                        if (this.data[row][j] == null) {
                            result.push({ row: row, column: j });
                        }
                        else {
                            if (this.data[row][j].color != piece.color)
                                result.push({ row: row, column: j });
                            break;
                        }
                    }
                    break;
                case 6 /* PieceType.Cannon */:
                    for (i = 0; i < rows; i++) {
                        if (i == row)
                            continue;
                        if ((this.data[i][column] == null || this.data[i][column].color != piece.color) && this.isValidMove(row, column, i, column))
                            result.push({ row: i, column: column });
                    }
                    for (j = 0; j < columns; j++) {
                        if (j == column)
                            continue;
                        if ((this.data[row][j] == null || this.data[row][j].color != piece.color) && this.isValidMove(row, column, row, j))
                            result.push({ row: row, column: j });
                    }
                    break;
                case 4 /* PieceType.Horse */:
                case 1 /* PieceType.King */:
                case 2 /* PieceType.Adviser */:
                case 3 /* PieceType.Elephant */:
                case 7 /* PieceType.Pawn */:
                    yTrans = 1;
                    if (piece.type == 7 /* PieceType.Pawn */) {
                        // Pawn "forward" direction. Previously read kingPos.row
                        // which crashes on cờ thế puzzles where one side's king
                        // is absent (TypeError swallowed up the move list).
                        // Use piece-color + rotated state directly — same
                        // kingInLowRow logic isValidMove uses.
                        var kingInLowRow = (piece.color === 2 /* Black */ && !this.rotated) ||
                                           (piece.color === 1 /* Red */ && this.rotated);
                        if (!kingInLowRow) yTrans = -1;
                    }
                    for (j = 0; j < moveColumn[piece.type].length; j++) {
                        var newColumn = column + moveColumn[piece.type][j];
                        if (newColumn < 0 || newColumn >= columns)
                            continue;
                        var newRow = row + moveRow[piece.type][j] * yTrans;
                        if (newRow < 0 || newRow >= rows)
                            continue;
                        var tmp = this.data[newRow][newColumn];
                        if ((tmp == null || tmp.color != piece.color) && this.isValidMove(row, column, newRow, newColumn))
                            result.push({ row: newRow, column: newColumn });
                    }
                    break;
            }
            return result;
        };
        Logic.prototype.isValidGeneralStateAfterMove = function (i1, j1, i2, j2) {
            var _this = this;
            var source = this.data[i1][j1];
            var target = this.data[i2][j2];
            var restoreState = function () {
                _this.data[i1][j1] = source;
                _this.data[i2][j2] = target;
            };
            // move invalid if:
            // - two kings face each other after the move or
            // - current player's king not in a checkmate
            //temp move souce to target
            this.data[i1][j1] = null;
            this.data[i2][j2] = source;
            //find two king's position
            var redKingPos = this.getKingPos(1 /* PieceColor.Red */);
            var blackKingPos = this.getKingPos(2 /* PieceColor.Black */);
            var k;
            //check general face-face — both kings must be present (a king
            //may be absent in cờ thế puzzles or after a king-capture move)
            if (redKingPos && blackKingPos && redKingPos.column === blackKingPos.column) {
                var isFaced = true;
                for (k = Math.min(redKingPos.row, blackKingPos.row) + 1; k < Math.max(redKingPos.row, blackKingPos.row); k++) {
                    if (this.data[k][redKingPos.column] != null) {
                        isFaced = false;
                        break;
                    }
                }
                if (isFaced) {
                    restoreState();
                    return false;
                }
            }
            //king of source's player must not in a check after move. If
            //own king is missing (e.g., the move just captured it — only
            //possible in puzzle setups; or puzzle started with no king),
            //skip the check rather than crashing on null.column.
            var ownKing = source.color == 1 /* PieceColor.Red */ ? redKingPos : blackKingPos;
            var enemyColor = source.color == 1 /* PieceColor.Red */ ? 2 /* Black */ : 1 /* Red */;
            if (ownKing && this.piecesCanMoveTo(enemyColor, ownKing.row, ownKing.column)) {
                restoreState();
                return false;
            }
            //restore source, target
            restoreState();
            return true;
        };
        Logic.prototype.rotate = function () {
            var i, j;
            var newData = [];
            for (i = 0; i < rows; i++) {
                newData[i] = [];
                for (j = 0; j < columns; j++) {
                    newData[i][j] = this.data[9 - i][8 - j];
                }
            }
            this.data = newData;
            this.rotated = !this.rotated;
        };
        Logic.prototype.getAiMove = function (color) {
            var _this = this;
            var result = [];
            var i, j;
            for (i = 0; i < rows; i++) {
                for (j = 0; j < columns; j++) {
                    var p = this.data[i][j];
                    if (p && p.color == color) {
                        var from = { row: i, column: j };
                        this.getMovables(i, j).forEach(function (m) {
                            if (_this.isValidGeneralStateAfterMove(from.row, from.column, m.row, m.column)) {
                                result.push({ from: from, to: m });
                            }
                        });
                    }
                }
            }
            result = shuffle(result);
            return result.pop();
        };
        Logic.prototype.hasMove = function (color) {
            var _this = this;
            var canMove = false;
            var i, j;
            for (i = 0; i < rows; i++) {
                for (j = 0; j < columns; j++) {
                    var p = this.data[i][j];
                    if (p && p.color == color) {
                        var from = { row: i, column: j };
                        this.getMovables(i, j).forEach(function (m) {
                            if (_this.isValidGeneralStateAfterMove(from.row, from.column, m.row, m.column)) {
                                canMove = true;
                                return;
                            }
                        });
                        if (canMove) {
                            return true;
                        }
                    }
                }
            }
            return false;
        };
        return Logic;
    }());
    Game.Logic = Logic;
    var Plugin = /** @class */ (function () {
        function Plugin(element, options) {
            this.nodes = [];
            this.pieces = [];
            this.turnColor = 1 /* PieceColor.Red */; /* red or black -- the color of current turn*/
            this.rotated = false;
            this.element = $(element);
            this.options = $.extend({}, defaults, options);
            this.logic = new Logic(this.options.variant);
            this.init();
        }
        Plugin.prototype.init = function () {
            this.element.addClass(colorStr(this.options.movableColor));
            var i, j;
            //init blank board
            for (i = 0; i < rows; i++) {
                this.nodes[i] = [];
                this.pieces[i] = [];
                for (j = 0; j < columns; j++) {
                    var node = $('<div/>').attr("class", ["p" + i + j, "xq-node"].join(" ")).data("position", {
                        row: i,
                        column: j
                    });
                    if (i === 0) {
                        node.attr('data-coord-top', j + 1);
                    }
                    if (i === rows - 1) {
                        node.attr('data-coord-bottom', 9 - j);
                    }
                    this.nodes[i][j] = node;
                    this.pieces[i][j] = null;
                    this.element.append(node);
                }
            }
            this._handleEvents();
        };
        Plugin.prototype.set = function (options) {
            this.options = $.extend({}, this.options, options);
        };
        Plugin.prototype.newBoard = function (movableColor, turnColor, variant, boardData) {
            this.rotated = false;
            this.logic.rotated = false;
            this.options.variant = variant || 1 /* Variant.Classic */;
            this.logic.variant = this.options.variant;
            this.logic.data = boardData || this.logic.getDefault();
            this._updateMovableColor(movableColor);
            this.turnColor = turnColor;
            if (this.aiMoving) {
                clearTimeout(this.aiMoving);
                this.aiMoving = null;
            }
            this._loaderDone();
            if (this.options.ai && this.options.variant == 2 /* Variant.Blind */) {
                this.logic.randomize();
            }
            //reset old data before update board
            this.lastMove = null;
            this.checkedPos = null;
            if (this.options.orientColor == 2 /* PieceColor.Black */ && !this.rotated ||
                this.options.orientColor == 1 /* PieceColor.Red */ && this.rotated) {
                this.rotate();
            }
            else {
                //rotate() will also update so need update only when not rotate
                this._update();
            }
        };
        Plugin.prototype.rotate = function () {
            this.logic.rotate();
            this.rotated = !this.rotated;
            //rotate last move
            if (this.lastMove) {
                this.lastMove.from = { row: 9 - this.lastMove.from.row, column: 8 - this.lastMove.from.column };
                this.lastMove.to = { row: 9 - this.lastMove.to.row, column: 8 - this.lastMove.to.column };
            }
            //rotate check position
            if (this.checkedPos) {
                this.checkedPos.row = 9 - this.checkedPos.row;
                this.checkedPos.column = 8 - this.checkedPos.row;
            }
            //reset node
            this._resetNodes();
            //clear selecting
            this.selectingPos = null;
            this._update();
        };
        Plugin.prototype.setTurn = function (color) {
            this.turnColor = color;
        };
        Plugin.prototype.move = function (m) {
            this._move({ row: m[0], column: m[1] }, { row: m[2], column: m[3] });
        };
        Plugin.prototype.draw = function (turn) {
            var _this = this;
            this._moveAnimate(turn.move, this.rotated, function (rollback) {
                _this.after(turn);
            });
        };
        Plugin.prototype.after = function (turn) {
            var m = turn.move;
            if (this.rotated) {
                m[0] = 9 - m[0];
                m[1] = 8 - m[1];
                m[2] = 9 - m[2];
                m[3] = 8 - m[3];
            }
            //update last-move obj
            this._removeLastMove();
            this.lastMove = { from: { row: m[0], column: m[1] }, to: { row: m[2], column: m[3] } };
            this._updateLastMove();
            //update checking
            this._removeCheck();
            if (turn.result.moveType == 3 /* MoveType.Check */ || turn.result.moveType == 4 /* MoveType.Checkmate */) {
                this._check(otherColor(this.logic.data[m[2]][m[3]].color));
            }
            //open piece if need
            if (turn.result.pieceType && this.options.variant == 2 /* Variant.Blind */) {
                this._open(m[2], m[3], turn.result.pieceType);
            }
        };
        Plugin.prototype.getLogic = function () {
            return this.logic;
        };
        Plugin.prototype.getTurn = function () {
            return this.turnColor;
        };
        Plugin.prototype._loaderStart = function () {
            if (this.options.loader) {
                this.options.loader.start();
            }
        };
        Plugin.prototype._loaderDone = function () {
            if (this.options.loader) {
                this.options.loader.done();
            }
        };
        Plugin.prototype._updateMovableColor = function (color) {
            this.options.movableColor = color;
            this.element.attr("class", ["xq-board", colorStr(this.options.movableColor)].join(" "));
        };
        Plugin.prototype._resetNodes = function () {
            var i, j;
            for (i = 0; i < rows; i++) {
                for (j = 0; j < columns; j++) {
                    this.nodes[i][j].attr("class", ["p" + i + j, "xq-node"].join(" "));
                }
            }
        };
        Plugin.prototype._removeLastMove = function () {
            if (this.lastMove) {
                this.nodes[this.lastMove.from.row][this.lastMove.from.column].removeClass('last-move');
                this.nodes[this.lastMove.to.row][this.lastMove.to.column].removeClass("last-move");
            }
        };
        Plugin.prototype._updateLastMove = function () {
            if (this.lastMove) {
                var fromNode = this.nodes[this.lastMove.from.row][this.lastMove.from.column];
                var toNode = this.nodes[this.lastMove.to.row][this.lastMove.to.column];
                fromNode.addClass('last-move');
                toNode.addClass('occupied last-move');
            }
        };
        Plugin.prototype._update = function () {
            this._resetNodes();
            var i, j;
            for (i = 0; i < rows; i++) {
                for (j = 0; j < columns; j++) {
                    var p = this.logic.data[i][j];
                    if (p) {
                        var node = this.nodes[i][j].addClass("occupied");
                        var piece = this.pieces[i][j] || $('<div/>');
                        piece.removeClass()
                            .addClass(pieceClass(p, this.options.variant))
                            .appendTo(node);
                        this.pieces[i][j] = piece;
                    }
                    else {
                        if (this.pieces[i][j]) {
                            this.pieces[i][j].remove();
                        }
                    }
                }
            }
            this._updateLastMove();
            this._updateCheck();
        };
        Plugin.prototype._clearState = function () {
            if (this.movables) {
                for (var i = 0; i < this.movables.length; i++) {
                    var m = this.movables[i];
                    this.nodes[m.row][m.column].removeClass("move-dest");
                }
                this.movables = null;
            }
            if (this.selectedNode) {
                this.selectedNode.removeClass("selected");
                this.selectedNode = null;
            }
        };
        Plugin.prototype._handleEvents = function () {
            var self = this;
            this.element.children(".xq-node").on("touchstart click", function (e) {
                //e.stopPropagation();
                //e.preventDefault();
                if (self.moving || self.options.movableColor !== self.turnColor) {
                    return;
                }
                //clear movables && selected
                self._clearState();
                var $this = $(this);
                var pos = $this.data("position");
                if (self.selectingPos) {
                    if (self.movableKeys[pos.row + ":" + pos.column] /*check the selected node is movable*/) {
                        self._move(self.selectingPos, pos);
                        self.selectingPos = null;
                        return;
                    }
                    else {
                        self.selectingPos = null;
                    }
                }
                var p = self.logic.data[pos.row][pos.column];
                if (p && p.color === self.options.movableColor) {
                    self.selectedNode = $this.addClass("selected");
                    self.selectingPos = pos;
                    //show movable
                    var movables = self.logic.getMovables(pos.row, pos.column);
                    self.movables = [];
                    self.movableKeys = {};
                    for (var i = 0; i < movables.length; i++) {
                        var m = movables[i];
                        // Defense in depth: a throw inside isValidGeneralStateAfterMove
                        // (historically: null kingPos in puzzles) used to abort the
                        // whole for-loop, silently dropping all subsequent move dots.
                        // Catch per-iteration so one bad move doesn't truncate the
                        // set. Engine bugs should be loud, not silent.
                        var ok = false;
                        try {
                            ok = self.logic.isValidGeneralStateAfterMove(pos.row, pos.column, m.row, m.column);
                        } catch (err) {
                            if (typeof console !== 'undefined' && console.error) {
                                console.error('isValidGeneralStateAfterMove threw — treating move as valid', err, m);
                            }
                            ok = true; // fail-open: better to show an extra dot than drop the rest
                        }
                        if (ok) {
                            self.movables.push(m);
                            self.movableKeys[m.row + ":" + m.column] = true;
                            self.nodes[m.row][m.column].addClass('move-dest');
                        }
                    }
                }
            });
        };
        Plugin.prototype._check = function (color) {
            var i, j;
            for (i = 0; i < rows; i++) {
                for (j = 0; j < columns; j++) {
                    var p = this.logic.data[i][j];
                    if (p && p.color == color && p.type == 1 /* PieceType.King */) {
                        this.nodes[i][j].addClass("check");
                        this.checkedPos = { row: i, column: j };
                        return;
                    }
                }
            }
        };
        Plugin.prototype._removeCheck = function () {
            if (this.checkedPos) {
                this.nodes[this.checkedPos.row][this.checkedPos.column].removeClass("check");
                this.checkedPos = null;
            }
        };
        Plugin.prototype._updateCheck = function () {
            if (this.checkedPos) {
                this.nodes[this.checkedPos.row][this.checkedPos.column].addClass("check");
            }
        };
        Plugin.prototype._vefiryCheck = function (color) {
            this._removeCheck();
            var other = otherColor(color);
            var kingPos = this.logic.getKingPos(color);
            if (kingPos) {
                if (this.logic.piecesCanMoveTo(other, kingPos.row, kingPos.column)) {
                    this.nodes[kingPos.row][kingPos.column].addClass("check");
                    this.checkedPos = { row: kingPos.row, column: kingPos.column };
                }
            }
        };
        Plugin.prototype._moveAnimate = function (m, rotated, complete) {
            var from = { row: m[0], column: m[1] };
            var to = { row: m[2], column: m[3] };
            //convert pos if rotated
            if (rotated) {
                from.row = 9 - from.row;
                from.column = 8 - from.column;
                to.row = 9 - to.row;
                to.column = 8 - to.column;
            }
            //complete all pending moving animations
            if (this.lastAnim) {
                this.lastAnim.finish();
                this.lastAnim = null;
            }
            if (this.lastFadingAnim) {
                this.lastFadingAnim.finish();
                this.lastFadingAnim = null;
            }
            //data            
            var p = this.logic.data[from.row][from.column];
            var pTo = this.logic.data[to.row][to.column];
            var piece = this.pieces[from.row][from.column];
            var pieceTo = this.pieces[to.row][to.column];
            var node = this.nodes[from.row][from.column];
            var nodeTo = this.nodes[to.row][to.column];
            if (p == null || piece == null) {
                return;
            }
            var self = this;
            node.removeClass('occupied');
            if (pieceTo) {
                this.lastFadingAnim = pieceTo.fadeOut(this.options.duration, function () {
                    self.lastFadingAnim = null;
                    $(this).remove();
                });
            }
            var fromOffset = node.offset();
            var toOffset = nodeTo.offset();
            var transX = fromOffset.left - toOffset.left;
            var transY = fromOffset.top - toOffset.top;
            piece.css({ zIndex: 2, "transform": "translate(" + transX + "px," + transY + "px)" }).appendTo(nodeTo);
            self.moving = true;
            this.lastAnim = piece.animate({ "transform": "translate(0px,0px)" }, this.options.duration, function () {
                self.lastAnim = null;
                var $this = $(this);
                $this.css({ zIndex: "", "transform": "" });
                //update new data
                //remove [from]
                self.logic.data[from.row][from.column] = null;
                self.pieces[from.row][from.column] = null;
                //update [to]
                self.pieces[to.row][to.column] = piece;
                self.logic.data[to.row][to.column] = p;
                nodeTo.addClass('occupied');
                if (complete) {
                    complete(function () {
                        //rollback here
                        self.logic.data[from.row][from.column] = p;
                        self.logic.data[to.row][to.column] = pTo;
                        self.pieces[from.row][from.column] = piece;
                        self.pieces[to.row][to.column] = pieceTo;
                        piece.appendTo(node.addClass('occupied'));
                        if (pieceTo) {
                            self.lastFadingAnim = pieceTo.appendTo(nodeTo.addClass('occupied'))
                                .fadeIn(self.options.duration * 2);
                        }
                    });
                }
                self.moving = false;
            });
        };
        Plugin.prototype._move = function (from, to) {
            var _this = this;
            var currentColor = this.turnColor;
            var nextColor = otherColor(this.turnColor);
            var backupLastMove = this.lastMove;
            var backupCheck = this.checkedPos;
            this._loaderDone();
            this._moveAnimate([from.row, from.column, to.row, to.column], false, function (rollback) {
                //update last-move
                _this._removeLastMove();
                _this.lastMove = { from: from, to: to };
                _this._updateLastMove();
                var gameOver = false;
                var fr = from.row;
                var fc = from.column;
                var tr = to.row;
                var tc = to.column;
                if (_this.rotated) {
                    fr = 9 - fr;
                    fc = 8 - fc;
                    tr = 9 - tr;
                    tc = 8 - tc;
                }
                if (_this.options.ai) {
                    //set opened
                    if (_this.options.variant == 2 /* Variant.Blind */) {
                        _this._open(to.row, to.column);
                    }
                    _this._vefiryCheck(nextColor);
                    //check game over
                    gameOver = !_this.logic.hasMove(nextColor);
                    if (gameOver) {
                        if (_this.options.endCallback) {
                            //notify winner
                            _this.options.endCallback(currentColor, [fr, fc, tr, tc]);
                        }
                        if (nextColor == 2 /* PieceColor.Black */ && _this.options.aiDefault && _this.options.aiLose) {
                            _this.options.aiLose(_this.options.variant);
                        }
                    }
                    if (nextColor == _this.options.aiColor && !gameOver) {
                        _this._loaderStart();
                        if (_this.options.aiDefault) {
                            //play ai turn
                            var m = _this.logic.getAiMove(nextColor);
                            _this.aiMoving = setTimeout(function () {
                                _this.aiMoving = null;
                                //ai move (this version ai use random moves ^_^)
                                _this._move(m.from, m.to);
                            }, 2000);
                        }
                    }
                }
                if (!_this.options.ai || (nextColor == _this.options.aiColor && !gameOver)) {
                    //invoke userMoveCallback
                    _this.options.moveCallback([fr, fc, tr, tc], function () {
                        //restore fail move
                        _this.turnColor = currentColor;
                        //restore last-move
                        _this._removeLastMove();
                        _this.lastMove = backupLastMove;
                        _this._updateLastMove();
                        //restore check
                        _this._removeCheck();
                        _this.checkedPos = backupCheck;
                        _this._updateCheck();
                        //ui rollback
                        rollback();
                    });
                }
                //change role to other
                _this.turnColor = nextColor;
            });
        };
        Plugin.prototype._open = function (row, column, type) {
            var p = this.logic.data[row][column];
            if (p && !p.opened) {
                p.opened = true;
                p.type = type || p.iType /*iType is use for ai client only*/;
                this.pieces[row][column].addClass(typeStr(p.type));
            }
        };
        return Plugin;
    }());
    Game.Plugin = Plugin;
})(Game || (Game = {}));
((function ($) {
    var pluginName = "xq";
    $.fn[pluginName] = function (options) {
        var args = arguments;
        if (options === undefined || typeof options === 'object') {
            return this.each(function () {
                if (!$.data(this, 'plugin_' + pluginName)) {
                    $.data(this, 'plugin_' + pluginName, new Game.Plugin(this, options));
                }
            });
        }
        else if (typeof options === 'string' && options[0] !== '_' && options !== 'init') {
            var instance = $.data(this.get(0), 'plugin_' + pluginName); //only call method of first element
            if (instance instanceof Game.Plugin && typeof instance[options] === 'function') {
                if (typeof instance[options] === 'function') {
                    return instance[options].apply(instance, Array.prototype.slice.call(args, 1));
                }
            }
        }
    };
})(jQuery));
