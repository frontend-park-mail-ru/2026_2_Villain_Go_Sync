declare module '*.hbs' {
  const template: (context?: object) => string;
  export default template;
}

declare module '*.css';

declare const process: {
  env: {
    API_URL: string;
  };
};
