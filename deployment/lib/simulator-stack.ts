import { CfnOutput, Duration, Stack, StackProps } from 'aws-cdk-lib';
import { SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { AwsLogDriver, Cluster, ContainerImage, FargateService, FargateTaskDefinition } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancer, ApplicationProtocol, ApplicationTargetGroup } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export class ApiSimulatorStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Create or import VPC
    const vpc = new Vpc(this, `DemoVpc`, {
      cidr: '10.1.0.0/18',
      maxAzs: 2,
      natGateways: 0, // enable NAT if you want to place ECS tasks in a private subnet and need the internet access
      subnetConfiguration: [
        {
          cidrMask: 22,
          name: `demo-public-subnet`,
          subnetType: SubnetType.PUBLIC,
        },
        {
          cidrMask: 22,
          name: `demo-isolated-subnet`,
          subnetType: SubnetType.PRIVATE_ISOLATED,
        },
        // {
        //     cidrMask: 22,
        //     name: `demo-private-subnet`,
        //     subnetType:SubnetType.PRIVATE_WITH_NAT,
        // },
      ]
    });

    // Create ECS cluster
    const cluster = new Cluster(this, `EcsCluster`, {
      vpc,
      containerInsights: false,
      enableFargateCapacityProviders: true,
    });

    // Create ALB
    const loadBalancer = new ApplicationLoadBalancer(this, `DemoALB`, {
      vpc,
      vpcSubnets: {
        subnetType: SubnetType.PUBLIC,
        onePerAz: true,
      },
      internetFacing: true,
    });

    /* HTTPS requires SSL cert
    const httpsListener = loadBalancer.addListener('HttpsListener', {
      port: 443,
      protocol: ApplicationProtocol.HTTPS,
      open: true,
      // certificates: ....
    });
    */

    const listener = loadBalancer.addListener('HttpListener', {
      port: 3000,
      protocol: ApplicationProtocol.HTTP,
      open: true,
    });

    const logGroup = new LogGroup(this, 'DemoLogGroup', {
      logGroupName: `demo-backend`,
      retention: RetentionDays.ONE_DAY,
    });

    // specify ECS Fargate task specs
    const taskDefinition = new FargateTaskDefinition(this, `DemoBackendTask`, {
      memoryLimitMiB: 1024,
      cpu: 512,
    });

    const username = StringParameter.valueForStringParameter(
      this, `/demo/wiremock-admin-username`);
    const password = StringParameter.valueForStringParameter(
      this, `/demo/wiremock-admin-password`);


    const proxy = taskDefinition.addContainer('auth-proxy', {
      image: ContainerImage.fromAsset('./../auth-proxy'),
      logging: new AwsLogDriver({
        streamPrefix: 'auth-proxy-',
        logGroup,
      }),
      environment: {
        DEMO_WIREMOCK_ADMIN_USER: username,
        DEMO_WIREMOCK_ADMIN_PASS: password,
      },
      portMappings: [{
        containerPort: 80,
      }],
      cpu: 128,
      memoryLimitMiB: 128,
      essential: true,
    });

    const apiContainer = taskDefinition.addContainer('wiremock-container', {
      // image: ecs.ContainerImage.fromEcrRepository(repo, 'latest'),
      image: ContainerImage.fromAsset('./../wiremock'),
      logging: new AwsLogDriver({
        streamPrefix: 'wiremock-',
        logGroup,
      }),
      environment: {
      },
      portMappings: [{
        containerPort: 8080,
      }],
      command: ["--local-response-templating"],
      essential: true,
    });

    const service = new FargateService(this, `DemoService`, {
      cluster,
      taskDefinition,
      desiredCount: 1,
      circuitBreaker: { rollback: true },
      vpcSubnets: {
        subnetType: SubnetType.PUBLIC,
        onePerAz: true
      },
      assignPublicIp: true,
      capacityProviderStrategies: [
        {
          capacityProvider: 'FARGATE_SPOT',
          weight: 1,
        },
      ],
    });

    const port = 80;
    listener.addTargetGroups('DemoTg', {
      targetGroups: [new ApplicationTargetGroup(this, 'DemoTargetGroup', {
        vpc,
        protocol: ApplicationProtocol.HTTP,
        port,
        targets: [service],
        healthCheck: {
          path: '/healthcheck',
          interval: Duration.minutes(5),
          healthyHttpCodes: '200,401,301,302'
        },
      })]
    });

    new CfnOutput(this, 'DemoAlbEndpoint', {
      exportName: 'demo-alb-endpoint',
      value: loadBalancer.loadBalancerDnsName
    });

  }
}