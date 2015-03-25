'use strict';

var fs        =  require('graceful-fs')
  , path      =  require('path')
  , minimatch =  require('minimatch')
  , toString  =  Object.prototype.toString
  ;

// Standard helpers
function isFunction (obj) {
  return toString.call(obj) === '[object Function]';
}

function isString (obj) {
  return toString.call(obj) === '[object String]';
}

function isRegExp (obj) {
  return toString.call(obj) === '[object RegExp]';
}

function isUndefined (obj) {
  return obj === void 0;
}

/** 
 * Main function which ends up calling readdirRec and reads all files and directories in given root recursively.
 * @param { Object }   opts     Options to specify root (start directory), filters and recursion depth
 * @return a dictionary containing files and directories, e.g.:
 * { directories: [], files: [] }
 */
function readdirSync(opts) {
  var handleError
    , handleFatalError
    , pending = 0
    , errors = []
    , readdirResult = {
        directories: []
      , files: []
    }
    , fileProcessed
    , allProcessed
    , realRoot
    , aborted = false
    ;

  if (isUndefined(opts)){
    handleFatalError(new Error (
      'Need to pass at least one argument: opts! \n' +
      'https://github.com/thlorenz/readdirp#options'
      )
    );
    return readdirResult;
  }

  opts.root            =  opts.root            || '.';
  opts.fileFilter      =  opts.fileFilter      || function() { return true; };
  opts.directoryFilter =  opts.directoryFilter || function() { return true; };
  opts.depth           =  typeof opts.depth === 'undefined' ? 999999999 : opts.depth;
  opts.entryType       =  opts.entryType       || 'files';

  //var statfn = opts.lstat === true ? fs.lstatSync.bind(fs) : fs.statSync.bind(fs);

  function normalizeFilter (filter) {

    if (isUndefined(filter)) return undefined;

    function isNegated (filters) {

      function negated(f) { 
        return f.indexOf('!') === 0; 
      }

      var some = filters.some(negated);
      if (!some) {
        return false;
      } else {
        if (filters.every(negated)) {
          return true;
        } else {
          // if we detect illegal filters, bail out immediately
          throw new Error(
            'Cannot mix negated with non negated glob filters: ' + filters + '\n' +
            'https://github.com/thlorenz/readdirp#filters'
          );
        }
      }
    }

    // Turn all filters into a function
    if (isFunction(filter)) {

      return filter;

    } else if (isString(filter)) {

      return function (entryInfo) {
        return minimatch(entryInfo.name, filter.trim());
      };

    } else if (filter && Array.isArray(filter)) {

      if (filter) filter = filter.map(function (f) {
        return f.trim();
      });

      return isNegated(filter) ?
        // use AND to concat multiple negated filters
        function (entryInfo) {
          return filter.every(function (f) {
            return minimatch(entryInfo.name, f);
          });
        }
        :
        // use OR to concat multiple inclusive filters
        function (entryInfo) {
          return filter.some(function (f) {
            return minimatch(entryInfo.name, f);
          });
        };
    }
  }


  function processDir(currentDir, entries) {
    if (aborted) return [];
    var total = entries.length;
    var processed = 0;
    var entryInfos = [];

    var realCurrentDir = fs.realpathSync(currentDir);

    if (!realCurrentDir) {
      return entryInfos;
    }

    if (aborted) return entryInfos;

    var relDir = path.relative(realRoot, realCurrentDir);

    if (entries.length === 0) {
      return [];
    } else {
      entries.forEach(function (entry) { 

        var fullPath = path.join(realCurrentDir, entry)
          , relPath  = path.join(relDir, entry);

          var stat = (opts.lstat === true) ? fs.lstatSync(fullPath) : fs.statSync(fullPath);

            entryInfos.push({
                name          :  entry
              , path          :  relPath   // relative to root
              , fullPath      :  fullPath

              , parentDir     :  relDir    // relative to root
              , fullParentDir :  realCurrentDir

              , stat          :  stat
            });
          processed++;
          if (processed === total) return;
        });
      return entryInfos;
    }
  }


  function readdirRec(currentDir, depth) {
    var entries = fs.readdirSync(currentDir);
    var entryInfos = processDir(currentDir, entries);

    var subdirs = entryInfos.filter(function (ei) { 
      return ei.stat.isDirectory() && opts.directoryFilter(ei); 
    });

    subdirs.forEach(function (di) {
        readdirResult.directories.push(di);
    });

    entryInfos.filter(function(ei) {
        var isCorrectType = opts.entryType === 'all' ?
          !ei.stat.isDirectory() : ei.stat.isFile() || ei.stat.isSymbolicLink();
        return isCorrectType && opts.fileFilter(ei);
      })
      .forEach(function (fi) {
          readdirResult.files.push(fi);
      });

    var pendingSubdirs = subdirs.length;

    // Be done if no more subfolders exist or we reached the maximum desired depth
    if(pendingSubdirs === 0 || depth === opts.depth) {
      return;
    } else {
      // recurse into subdirs, keeping track of which ones are done 
      // and call back once all are processed
      subdirs.forEach(function (subdir) {
        readdirRec(subdir.fullPath, depth + 1);
      });
    }
  }

  // Validate and normalize filters
  try {
    opts.fileFilter = normalizeFilter(opts.fileFilter);
    opts.directoryFilter = normalizeFilter(opts.directoryFilter);
  } catch (err) {
    // if we detect illegal filters, bail out immediately
    //throw err;
    return err;
  }

  // If filters were valid get on with the show
  var realRoot = fs.realpathSync(opts.root);
  readdirRec(realRoot, 0);
  return readdirResult;
}

module.exports = readdirSync;
