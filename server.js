var 
cluster = require('cluster'),
http = require('http'),
//util = require('util'),
fs = require('fs'),
path = require('path'),
url = require('url'),
zlib = require("zlib"),
os = require('os'),
numCPUs = os.cpus().length,
//服务器标志字符串
serverString = 	'NodeJS(https://github.com/ThinkBest/NodeJs-Static-Server)' + ','+ 
						os.type() + '('+os.platform() + ')/' + os.release()+','+os.hostname(),

mime = require('./mime.js').mime,
getTarget = require('./vhost.js').getTarget,
listFiles = require('./dirlist.js').list,
//写日志文件
logger = fs.openSync('log.txt','a'),
log = function(text){
    fs.write(logger,(new Date()).toUTCString() + '  ' + text + '\r\n',0,0,null);
};

//集群
if (cluster.isMaster) {
	for (var i = 0; i < numCPUs; i++) {
		cluster.fork();
	}
	cluster.on('death', function(worker) {
		log('worker ' + worker.pid + ' died.');
		cluster.fork();
	});
	console.log('listening 80 with ' + numCPUs + ' workers.');
} 
else{
	//监听端口
	http.createServer(function(req,res){
		//返回服务器标志
		res.setHeader('Server', serverString);
		parse({
			req:req,
			res:res
		});
	}).listen(80);
}

var 
//收到请求后
parse = function(obj) {
	var
	req = obj.req,
	urlObj = url.parse(req.url||'');
	//获取主机名
	obj.host = req.headers['host']||'';
	//获取路径名
	obj.pathname = urlObj.pathname;
	//获取参数
	obj.query = urlObj.query;
	/*
	* 获取目标文件列表,函数位于vhost.js文件中，可以自己定义内部逻辑
	* 传入对象{req,res,host,pathname,query}
	* 返回数组,例如[{type:'disk','D:\1.js'},{type:'rewrite','http://xxx/1.js'}],当数组中第一个文件访问失败，会使用下一个文件
	*/
	obj.fileList = getTarget(obj);
	//目标文件列表不为空，开始响应请求
	if(obj.fileList.length>0){
		response(obj);
	}
	else{
		//没有目标文件时显示提示文字
		obj.res.writeHead(200, {'Content-Type': 'text/plain'});
		obj.res.end('Node.JS is running \n');
	}    
},

//响应请求
response = function(obj){
	//取出目标文件列表中的第一个，判断是发送文件还是重定向
	var target = obj.fileList.shift();
	if(target&&target.type&&target.file){
		obj.file = target.file;
		switch(target.type){
			//重定向
			case 'redirect':
				redirect(obj);
				break;
			//磁盘文件
			case 'disk':
				sendFile(obj);
				break;
			//列出目录
			case 'list':
				directory(obj);
				break;
			//直接返回状态
			case 'code':
				obj.res.statusCode = target.code;
				obj.res.end();
		}	
	}
},

//重定向
redirect = function(obj){
	var 
	res = obj.res,
	req = obj.req,
	file = obj.file,
	urlObj = url.parse(file||'');
	//写日志
	log(obj.host+req.url+' -> '+file);
	//目标文件写入响应头
	res.setHeader('X-Forward', file);
	
	var remoteReq = http.request({
		host: urlObj.host,
		port: urlObj.port||80,
		path: urlObj.path||obj.pathname,
		method: req.method||'GET',
		agent:false,
		headers: req.headers
	}, function(remoteRes){
		//如果访问远程文件失败，且目标文件列表不为空，则使用下一个目标文件响应
		if((remoteRes.statusCode !== 200)&&(obj.fileList.length>0)){
			response(obj);
		}
		else{
			//复制响应头
			res.writeHead(remoteRes.statusCode,remoteRes.headers);
			//复制数据
			remoteRes.on('data',function(chunk){
				res.write(chunk);
			});
			remoteRes.on('end',function(){
				res.end();
			});
		}
	});
	remoteReq.on('error',function(){
		//如果访问远程文件失败，且目标文件列表不为空，则使用下一个目标文件响应
		if((remoteRes.statusCode !== 200)&&(obj.fileList.length>0)){
			response(obj);
		}
		else{
			res.statusCode = 503;
			res.end();
		}
	});
	//设置3秒后触发超时
	setTimeout(function() {
		remoteReq.emit('req-timeout');
	},3000);
	remoteReq.on('req-timeout',function(){
		if (remoteReq) { 
			remoteReq.abort(); 
		}
	});
	remoteReq.end();
},
//列出目录
directory = function(obj){
	var 
	res = obj.res,
	req = obj.req,
	html = '',
	file = decodeURIComponent(path.normalize(obj.file));
	obj.file = file;
	fs.readdir(file,function(err,files){
		if(!err){
			/*
			* listFiles函数位于dirlist.js文件中
			* 可以自己定义内部的逻辑
			* 只要能返回html就可以
			*/
			html = listFiles(obj,files);
			sendHTML(obj,html);
		}
		else{
			//如果目标文件访问出错，且目标文件列表不为空，则使用下一个目标文件响应
			if(obj.fileList.length>0){
				response(obj);
			}
			else{
				res.statusCode = 503;
				res.end();
			}
		}
	});
},
//发送html
sendHTML = function(obj,html){
	var
	res = obj.res;
	//目标文件写入响应头
	res.setHeader('X-Forward', obj.file);
	res.writeHead(200, {
		'Content-Length': html.length,
		'Content-Type': 'text/html' 
	});
	res.write(html);
	res.end();
},
//发送文件
sendFile = function(obj){
	var 
	res = obj.res,
	req = obj.req,
	//规范文件路径
	file = decodeURIComponent(path.normalize(obj.file));
	//写日志
	log(obj.host+req.url+' -> '+file);
	//目标文件写入响应头
	res.setHeader('X-Forward', file);
	//检查目标文件状态
	fs.stat(file, function (err,stats) {
		if(!err){
			if(stats.isFile()){
				//目标是文件
				var 
				//获取文件最后修改时间
				lastModified = stats.mtime.toUTCString(),
				//获取后缀名
				ext = path.extname(file),
				ext = ext ? ext.slice(1) : 'unknown';
				//获取mime类型
				var 
				mimeType = mime[ext] || 'application/octet-stream',
				//通用响应头
				headers = {
					'Content-Type': mimeType,
					'Last-Modified':lastModified
				};
				//文件未修改，返回304
				if (req.headers['if-modified-since'] && lastModified === req.headers['if-modified-since']) { 
					res.statusCode = 304;
					res.end(); 
				}
				else{
					//文件流
					var raw = fs.createReadStream(file);
					//对css/js/html文件做压缩
					if(/css|js|html|htm/ig.test(ext)){
						if(/gzip/.test(req.headers['accept-encoding'] || '')){
							headers['Content-Encoding'] = 'gzip';
							res.writeHead(200,headers); 
							raw.pipe(zlib.createGzip()).pipe(res); 
						}
						else if(/deflate/.test(req.headers['accept-encoding'] || '')){
							headers['Content-Encoding'] = 'deflate';
							res.writeHead(200,headers); 
							raw.pipe(zlib.createDeflate()).pipe(res); 
						}
						else{
							//浏览器不支持压缩
							res.writeHead(200,headers);
							raw.pipe(res);
						}
					}
					else{
						//不是css、js、html则不压缩
						res.writeHead(200,headers);
						raw.pipe(res);
					}
				}
			}
			else
			{
				//如果是目录，目标文件列表头部插入index文件
				if(stats.isDirectory()){
					//注意优先级是倒过来的，优先级index.html>index.htm>列出目录					
					obj.fileList.unshift({type:'list',file:file});
					obj.fileList.unshift({type:'disk',file:file+'/index.htm'});
					obj.fileList.unshift({type:'disk',file:file+'/index.html'});
				}

				//如果目标文件访问出错，且目标文件列表不为空，则使用下一个目标文件响应
				if(obj.fileList.length>0){
					response(obj);
				}
				else{
					res.statusCode =404;
					res.end();
				}
			}
		}
		else{
			//如果目标文件访问出错，且目标文件列表不为空，则使用下一个目标文件响应
			if(obj.fileList.length>0){
				response(obj);
			}
			else{
				res.statusCode =404;
				res.end();
			}
		}
	});
};