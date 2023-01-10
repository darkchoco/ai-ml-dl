'use strict';

const request = require('request');
const urlParser = require('url');
const URLSearchParams = require('url').URLSearchParams;
const shortid = require('shortid');
const asnc = require('async');
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const sqs = new AWS.SQS({ region: process.env.REGION });
const images = require('./images')();

function writeStatus (url, domain, results) {
  let parsed = urlParser.parse(url);
  parsed.hostname = domain;
  parsed.host = domain;
  const statFile = {
    url: urlParser.format(parsed),
    stat: 'downloaded',
    downloadResults: results
  };

  return new Promise((resolve) => {
    s3.putObject({
      Bucket: process.env.BUCKET,
      Key: domain + '/status.json',
      Body: Buffer.from(JSON.stringify(statFile, null, 2), 'utf8')
    }, (err) => {
      resolve({ stat: err || 'ok' });
    });
  });
}

function createUniqueDomain (url) {
  const parsed = urlParser.parse(url);
  const sp = new URLSearchParams(parsed.search);
  let domain;

  if (sp.get('q')) {
    domain = sp.get('q') + '.' + parsed.hostname;
  } else {
    domain = shortid.generate() + '.' + parsed.hostname;
  }

  domain = domain.replace(/ /g, '');
  return domain.toLowerCase();
}

function crawl (domain, url) {
  console.log('crawling: ' + url);

  return new Promise(resolve => {
    request(url, (err, response, body) => {
      if (err || response.statusCode !== 200) {
        return resolve({ statusCode: 500, body: err });
      }

      images.parseImageUrls(body, url).then(urls => {  // 이미지 목록을 fetchImages에 전달
        images.fetchImages(urls, domain).then(results => {  // 이미지 다운로드
          writeStatus(url, domain, results).then(result => {  // writes a status file to the bucket for downstream services to consume before resolving the promise
            resolve({ statusCode: 200, body: JSON.stringify(result) });
          });
        });
      });
    });
  });
}

function queueAnalysis (domain, url, context) {
  let accountId = process.env.ACCOUNTID;
  if (!accountId) {
    accountId = context.invokedFunctionArn.split(':')[4];
  }
  let queueUrl = `https://sqs.${process.env.REGION}.amazonaws.com/${accountId}/${process.env.ANALYSIS_QUEUE}`;

  // 메시지 본체 생성
  let params = {
    MessageBody: JSON.stringify({ action: 'analyze', msg: { domain: domain } }),
    QueueUrl: queueUrl
  };

  // SQS에 메시지 포스팅
  return new Promise(resolve => {
    sqs.sendMessage(params, (err, data) => {
      if (err) {
        console.log('QUEUE ERROR: ' + err);
        return resolve({ statusCode: 500, body: err });
      }
      console.log('queued analysis: ' + queueUrl);
      resolve({ statusCode: 200, body: { queue: queueUrl, msgId: data.MessageId } });
    });
  });
}

module.exports.crawlImages = function (event, context, cb) {
  // https://sub0709.tistory.com/3 ([node.js] async 패키지 써보기)
  // https://caolan.github.io/async/v3/docs.html#eachSeries
  // eachSeries(coll, iteratee, callback) { }
  // - coll: Array | Iterable | AsyncIterable | Object -- A collection to iterate over.
  // - iteratee: AsyncFunction -- An async function to apply to each item in coll.
  //             The array index is not passed to the iteratee.
  //             If you need the index, use eachOfSeries. Invoked with (item, callback).
  // - callback (optional): A callback which is called when all iteratee functions have finished, or an error occurs.
  //                        Invoked with (err).
  asnc.eachSeries(event.Records, (record, asnCb) => {
    // Destructuring assignment
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Destructuring_assignment
    let { body } = record;

    try {
      body = JSON.parse(body);
    } catch (exp) {
      return asnCb('message parse error: ' + record);
    }

    if (body.action === 'download' && body.msg && body.msg.url) {
      const udomain = createUniqueDomain(body.msg.url);
      crawl(udomain, body.msg.url).then(() => {  // crawling이 완료되면
        queueAnalysis(udomain, body.msg.url, context).then(result => {  // 다운로드 된 이미지가 분석 준비 되었음을 알리는
                                                                        // 메시지를 queue에 넣는다
          asnCb(null, result);
        });
      });
    } else {
      asnCb('malformed message');
    }
  }, (err) => {
    if (err) {
      console.log(err);
    }
    cb();
  });
};
