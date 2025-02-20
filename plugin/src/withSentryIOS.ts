import {
  ConfigPlugin,
  withDangerousMod,
  withXcodeProject,
  WarningAggregator,
} from '@expo/config-plugins';
import * as fs from 'fs';
import * as path from 'path';

export const withSentryIOS: ConfigPlugin<string> = (config, sentryProperties: string) => {
  config = withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;

    const sentryBuildPhase = xcodeProject.pbxItemByComment(
      'Upload Debug Symbols to Sentry',
      'PBXShellScriptBuildPhase'
    );
    if (!sentryBuildPhase) {
      xcodeProject.addBuildPhase(
        [],
        'PBXShellScriptBuildPhase',
        'Upload Debug Symbols to Sentry',
        null,
        {
          shellPath: '/bin/sh',
          shellScript:
            'export SENTRY_PROPERTIES=sentry.properties\\n' +
            "`node --print \"require.resolve('@sentry/cli/package.json').slice(0, -13) + '/bin/sentry-cli'\"` upload-dsym --force-foreground",
        }
      );
    }

    let bundleReactNativePhase = xcodeProject.pbxItemByComment(
      'Bundle React Native code and images',
      'PBXShellScriptBuildPhase'
    );
    modifyExistingXcodeBuildScript(bundleReactNativePhase);

    return config;
  });

  return withDangerousMod(config, [
    'ios',
    (config) => {
      writeSentryPropertiesTo(path.resolve(config.modRequest.projectRoot, 'ios'), sentryProperties);
      return config;
    },
  ]);
};

export function modifyExistingXcodeBuildScript(script: any): void {
  if (
    !script.shellScript.match(/(packager|scripts)\/react-native-xcode\.sh\b/) ||
    script.shellScript.match(/bin\/sentry-cli.*react-native[\s-]xcode/)
  ) {
    WarningAggregator.addWarningIOS(
      'sentry-expo',
      `Unable to modify build script 'Bundle React Native code and images'. Please open a bug report at https://github.com/expo/sentry-expo.`
    );
    return;
  }
  let code = JSON.parse(script.shellScript);
  code =
    'export SENTRY_PROPERTIES=sentry.properties\n' +
    'export EXTRA_PACKAGER_ARGS="--sourcemap-output $DERIVED_FILE_DIR/main.jsbundle.map"\n' +
    code.replace(
      /^.*?(packager|scripts)\/react-native-xcode\.sh\s*(\\'\\\\")?/m,
      (match: any) =>
        "`node --print \"require.resolve('@sentry/cli/package.json').slice(0, -13) + '/bin/sentry-cli'\"` react-native xcode --force-foreground " +
        match
    );

  script.shellScript = JSON.stringify(code);
}

export function writeSentryPropertiesTo(filepath: string, sentryProperties: string) {
  if (!fs.existsSync(filepath)) {
    throw new Error("Directory '" + filepath + "' does not exist.");
  }

  fs.writeFileSync(path.resolve(filepath, 'sentry.properties'), sentryProperties);
}
