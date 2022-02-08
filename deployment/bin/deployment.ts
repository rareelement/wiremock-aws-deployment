#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ApiSimulatorStack } from '../lib/simulator-stack';

const app = new cdk.App();
new ApiSimulatorStack(app, 'ApiSimulatorStack', {});
