"""
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0

Permission is hereby granted, free of charge, to any person obtaining a copy of this
software and associated documentation files (the "Software"), to deal in the Software
without restriction, including without limitation the rights to use, copy, modify,
merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
"""
import json
from transformers import AutoTokenizer, AutoModelForQuestionAnswering
import torch
from aws_lambda_powertools import Metrics, Logger, Tracer
from aws_lambda_powertools.metrics import MetricUnit
import os
import shutil

# Lambda Powertools Setup
logger = Logger()
tracer = Tracer()
metrics = Metrics()

# Note: For bootstrapping purposes of the demo only! Copying 
# model files from OCI to EFS. For a real-world use case, this
# step may be skipped and you can pre-load EFS with your model
# files.
logger.info('Copying model files')
os.makedirs(os.path.dirname('/mnt/lambda/model1/'), exist_ok=True)
os.makedirs(os.path.dirname('/mnt/lambda/model2/'), exist_ok=True)
shutil.copy('./model1/pytorch_model.bin', '/mnt/lambda/model1/pytorch_model.bin')
shutil.copy('./model1/config.json', '/mnt/lambda/model1/config.json')
shutil.copy('./model1/tokenizer.json', '/mnt/lambda/model1/tokenizer.json')
shutil.copy('./model1/tokenizer_config.json', '/mnt/lambda/model1/tokenizer_config.json')
shutil.copy('./model2/pytorch_model.bin', '/mnt/lambda/model2/pytorch_model.bin')
shutil.copy('./model2/config.json', '/mnt/lambda/model2/config.json')
shutil.copy('./model2/tokenizer.json', '/mnt/lambda/model2/tokenizer.json')
shutil.copy('./model2/tokenizer_config.json', '/mnt/lambda/model2/tokenizer_config.json')


@tracer.capture_lambda_handler
@metrics.log_metrics(capture_cold_start_metric=True)
@logger.inject_lambda_context(log_event=True)
def lambda_handler(event, context):

    body = json.loads(event['body'])
    
    model_type = body['model_type']
    question = body['question']
    context = body['context']
    
    if model_type == 'nlp1':
        logger.info('NLP Model Version 1 loaded')
        # Set up Tokenizer and Model, looks inside model/ folder
        tokenizer1 = AutoTokenizer.from_pretrained("/mnt/lambda/model1/")
        model1 = AutoModelForQuestionAnswering.from_pretrained("/mnt/lambda/model1/")
        tokenizer = tokenizer1
        model = model1
    elif model_type == 'nlp2':
        logger.info('NLP Model Version 2 loaded')
        # Loading Model 2 inside handler
        tokenizer2 = AutoTokenizer.from_pretrained("/mnt/lambda/model2/")
        model2 = AutoModelForQuestionAnswering.from_pretrained("/mnt/lambda/model2/")
        tokenizer = tokenizer2
        model = model2
    else:
        logger.info('No model specified, loading version 1.')
        # Set up Tokenizer and Model, looks inside model/ folder
        tokenizer1 = AutoTokenizer.from_pretrained("/mnt/lambda/model1/")
        model1 = AutoModelForQuestionAnswering.from_pretrained("/mnt/lambda/model1/")
        tokenizer = tokenizer1
        model = model1
        model_type = 'nlp1'

    inputs = tokenizer.encode_plus(question, context,add_special_tokens=True, return_tensors="pt")
    input_ids = inputs["input_ids"].tolist()[0]

    output = model(**inputs)
    answer_start_scores = output.start_logits
    answer_end_scores = output.end_logits

    answer_start = torch.argmax(answer_start_scores)
    answer_end = torch.argmax(answer_end_scores) + 1

    answer = tokenizer.convert_tokens_to_string(tokenizer.convert_ids_to_tokens(input_ids[answer_start:answer_end]))

    print('Question: {0}, Answer: {1}'.format(question, answer))
    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps({
            'Model_Type': model_type,
            'Question': question,
            'Answer': answer
        })
    }
