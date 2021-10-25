import os from 'os';
import process from 'process';
import spawn from 'cross-spawn';

function browser(url: string): void {
  let platform = process.platform;
  if (platform === 'linux' && os.release().indexOf('Microsoft') !== -1) {
    platform = 'win32';
  }
  let command;
  switch (platform) {
    case 'win32': {
      command = 'cmd.exe';
      break;
    }
    case 'darwin': {
      command = 'open';
      break;
    }
    default: {
      command = 'xdg-open';
      break;
    }
  }
  let args = [url];
  if (platform === 'win32') {
    // On Windows, we really want to use the "start" command. But, the rules
    // regarding arguments with spaces, and escaping them with quotes, can get
    // really arcane. So the easiest way to deal with this is to pass off the
    // responsibility to "cmd /c", which has that logic built in.
    //
    // Furthermore, if "cmd /c" double-quoted the first parameter, then "start"
    // will interpret it as a window title, so we need to add a dummy
    // empty-string window title: http://stackoverflow.com/a/154090/3191
    //
    // Additionally, on Windows ampersand and caret need to be escaped when
    // passed to "start"
    args = args.map((value) => {
      return value.replace(/[&^]/g, '^$&');
    });
    args = ['/c', 'start', '""'].concat(args);
  }
  const browserProcess = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
  });
  browserProcess.unref();
}

export { browser };
