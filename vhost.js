var util = require('util');
/*
* 请求对应表
* forward可以是数组也可以是字符串
* http开头表示重定向
*/
var vhost = [
	{
		host:/style\.china\.alibaba\.com/,
		pathname:/^\/(.*)$/,
		forward:'http://172.22.35.70/$1'
	},	
	{
		host:/static\.c\.aliimg\.com/,
		pathname:/^\/(.*)$/,
		forward:[
			'D:\\workspace\\static\\$1',
			'http://172.22.35.70/$1'
		]
	},
	{
		host:/alibaba-47418.*/,
		pathname:/^\/(.*)$/,
		forward:'D:\\workspace\\website\\$1'
	}
];

//放入列表前去除css和js文件的压缩
var addFile = function (list,file){
	if(file){
		if(/-min\.(css|js)/.test(file)){
			list.push(file.replace(/-min.(css|js)/,'.$1'));
		}
		list.push(file);
	}
};

//获取目标文件列表，返回是数组
exports.getTarget = function(obj){
	var
	host = obj.host,
	pathname = obj.pathname,
	forward,fileList = [],
	len = vhost.length;
	for (var i = 0; i < len; i++) {
		if(vhost[i].host.test(host)&&vhost[i].pathname.test(pathname)){
			forward = vhost[i].forward;
			if(util.isArray(forward)){
				for(var j=0 ;j<forward.length;j++){
					addFile(fileList,pathname.replace(vhost[i].pathname,forward[j]));
				}
			}
			else{
				addFile(fileList,pathname.replace(vhost[i].pathname,forward));
			}
			return fileList;
		}
	}
	return fileList;
};