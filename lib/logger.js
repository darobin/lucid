
import chalk from "chalk";

const noop = () => {};

export default class Logger {
  constructor (level = 'log') {
    this.level = level;
    this.setLevel(level);
  }
  setLevel (level) {
    this.verbose = ['verbose'].includes(level) ? (str, ...rest) => console.log(chalk.gray(str), ...rest) : noop;
    this.log = ['verbose', 'log'].includes(level) ? (str, ...rest) => console.log(str, ...rest) : noop;
    this.success = ['verbose', 'log'].includes(level) ? (str, ...rest) => console.log(chalk.green(str), ...rest) : noop;
    this.warn = ['verbose', 'log', 'warn'].includes(level) ? (str, ...rest) => console.log(chalk.yellow(str), ...rest) : noop;
    this.error = ['verbose', 'log', 'warn', 'error'].includes(level) ? (str, ...rest) => console.log(chalk.redBright(str), ...rest) : noop;
  }
}
